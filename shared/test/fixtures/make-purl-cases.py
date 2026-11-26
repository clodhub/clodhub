"""Builds purl-cases.json from a Python reference of spec section 6a, written separately from the TypeScript parser."""
import json
import re
import sys
import unicodedata
from urllib.parse import unquote

FORBIDDEN = {"Cc", "Cf", "Zs", "Zl", "Zp", "Co", "Cs"}
NS_MIN = {"maven": 1, "golang": 1, "github": 1, "bitbucket": 1, "composer": 1, "swift": 2}
NS_NONE = {"cargo", "gem", "pypi", "nuget", "hex", "pub", "cocoapods", "hackage", "conda"}
NS_EXACT = {"clod": 1}


def decode(raw):
    if re.search(r"%(?![0-9A-Fa-f]{2})", raw):
        return None
    try:
        text = unquote(raw, errors="strict")
    except UnicodeDecodeError:
        return None
    if any(unicodedata.category(c) in FORBIDDEN for c in text):
        return None
    return text


def parse(v):
    if not isinstance(v, str) or len(v) > 1000 or not re.fullmatch(r"[\x21-\x7e]+", v):
        return None
    if not v.startswith("pkg:"):
        return None
    rest = v[4:]
    subpath = None
    if "#" in rest:
        rest, subpath = rest.split("#", 1)
    qualifiers = None
    if "?" in rest:
        rest, qualifiers = rest.split("?", 1)
    if "/" not in rest:
        return None
    kind, path = rest.split("/", 1)
    if not re.fullmatch(r"[a-z][a-z0-9.+-]*", kind):
        return None
    version = None
    at = path.rfind("@")
    if at > path.rfind("/"):
        path, version = path[:at], path[at + 1:]
        if version == "":
            return None
        version = decode(version)
        if version is None:
            return None
    raw_segments = path.split("/")
    if any(s == "" for s in raw_segments):
        return None
    segments = [decode(s) for s in raw_segments]
    if any(s is None for s in segments):
        return None
    name, namespace = segments[-1], segments[:-1]
    if name == "" or name.startswith("@"):
        return None
    if kind in NS_NONE and namespace:
        return None
    if len(namespace) < NS_MIN.get(kind, 0):
        return None
    if kind in NS_EXACT and len(namespace) != NS_EXACT[kind]:
        return None
    if kind == "swift" and "." not in namespace[0]:
        return None
    if kind == "npm" and namespace and (len(namespace) > 1 or not namespace[0].startswith("@") or len(namespace[0]) < 2):
        return None
    quals = {}
    if qualifiers is not None:
        if qualifiers == "":
            return None
        for pair in qualifiers.split("&"):
            if "=" not in pair:
                return None
            key, value = pair.split("=", 1)
            if not re.fullmatch(r"[a-z][a-z0-9._-]*", key) or key in quals or value == "":
                return None
            value = decode(value)
            if value is None or value == "":
                return None
            quals[key] = value
    sub = []
    if subpath is not None:
        if subpath == "":
            return None
        for raw in subpath.split("/"):
            seg = decode(raw)
            if seg is None or seg in ("", ".", ".."):
                return None
            sub.append(seg)
    return {"type": kind, "namespace": namespace, "name": name, "version": version, "qualifiers": dict(sorted(quals.items())), "subpath": sub}


def cases():
    corpus = json.load(open(sys.argv[1]))
    out = [(p, None) for p in corpus]
    add = lambda purl, accept: out.append((purl, accept))
    # Raw string: printable ASCII only, and the length limit.
    add("pkg:npm/a@1.0", True)
    for c in [" ", "\t", "\n", "\x00", "\x1c", "\x1d", "\x1e", "\x1f", "\x7f", "\x85", "\xa0", "\u180e", "\u200b", "\u2028", "\u2029", "\ufeff", "\ue000", "\ud800", "\u00e9", "\U0001F600"]:
        add(f"pkg:npm/a{c}b@1.0", False)
    add("pkg:npm/a\\b@1.0", True)
    add('pkg:npm/a"b@1.0', True)
    add("pkg:npm/a<b>@1.0", True)
    base = "pkg:generic/"
    add(base + "a" * (1000 - len(base)), True)
    add(base + "a" * (1001 - len(base)), False)
    emoji = "%F0%9F%98%80"
    add(base + emoji + "a" * (1000 - len(base) - len(emoji)), True)
    add(base + emoji + "a" * (1001 - len(base) - len(emoji)), False)
    add(base + "\U0001F600", False)
    # Percent escapes.
    for p, ok in [("pkg:npm/a%41b@1.0", True), ("pkg:npm/a%4@1.0", False), ("pkg:npm/a%@1.0", False), ("pkg:npm/a%zz@1.0", False), ("pkg:npm/a@1.0%", False),
                  ("pkg:npm/a%C3%A9@1.0", True), ("pkg:npm/a%c3%a9@1.0", True), ("pkg:npm/a%C3@1.0", False), ("pkg:npm/a%C0%80@1.0", False), ("pkg:npm/a%ED%A0%80@1.0", False),
                  ("pkg:npm/a%E4%B8%AD@1.0", True), ("pkg:npm/a%FF@1.0", False), ("pkg:npm/a%EF%BF%BE@1.0", True), ("pkg:npm/a%2Fb@1.0", True), ("pkg:npm/a%2Bb@1.0", True), ("pkg:npm/a+b@1.0", True)]:
        add(p, ok)
    # Malformed percent escapes in every component: refused.
    for p in ["pkg:npm/bad-1@1.0.0?x=%", "pkg:npm/a@1#%zz", "pkg:npm/a@1.0#%zz", "pkg:npm/a%", "pkg:npm/a%@1.0", "pkg:npm/a%2", "pkg:maven/org%g1x/lib@1.0",
              "pkg:maven/org%/lib@1.0", "pkg:npm/lib@1.0?k=%C3", "pkg:npm/lib@1.0?k=%C3%28", "pkg:npm/lib@1.0?k=a%", "pkg:npm/lib@1.0%zz", "pkg:npm/lib@%C3",
              "pkg:npm/lib@1.0#a/%C3", "pkg:npm/lib@1.0#a%2"]:
        add(p, False)
    # Decoded content: each class, encoded, in each component.
    forbidden = {
        "Cc": ["%00", "%09", "%0A", "%0D", "%1C", "%1D", "%1E", "%1F", "%7F", "%C2%80", "%C2%85", "%C2%9F"],
        "Cf": ["%C2%AD", "%D8%9C", "%E1%A0%8E", "%E2%80%8B", "%E2%80%8D", "%E2%80%8E", "%E2%81%A0", "%EF%BB%BF", "%F3%A0%80%81"],
        "Zs": ["%20", "%C2%A0", "%E2%80%80", "%E3%80%80"],
        "Zl": ["%E2%80%A8"],
        "Zp": ["%E2%80%A9"],
        "Co": ["%EE%80%80", "%EF%A3%BF", "%F3%B0%80%80", "%F4%8F%BF%BD"],
        "Cs": ["%ED%A0%80", "%ED%BF%BF"],
    }
    for escapes in forbidden.values():
        for e in escapes:
            add(f"pkg:npm/a{e}b@1.0", False)
    for e in ["%1C", "%C2%85", "%EF%BB%BF", "%E1%A0%8E", "%E2%80%8B", "%20"]:
        add(f"pkg:maven/org{e}x/lib@1.0", False)
        add(f"pkg:npm/lib@1.0{e}", False)
        add(f"pkg:npm/lib@1.0?k=v{e}", False)
        add(f"pkg:npm/lib@1.0#a{e}", False)
    for ok in ["%C3%A9", emoji, "%E4%B8%AD", "%E2%82%AC", "%CE%A9"]:
        add(f"pkg:npm/a{ok}@1.0", True)
        add(f"pkg:npm/lib@1.0?k={ok}", True)
        add(f"pkg:npm/lib@1.0#d{ok}", True)
    # Form and type.
    for p, ok in [("npm/a@1.0", False), ("PKG:npm/a@1.0", False), ("pkg:/a@1.0", False), ("pkg:npm", False), ("pkg:npm/", False), ("pkg:npm//a@1.0", False), ("pkg:npm/a/@1.0", False),
                  ("pkg://npm/a@1.0", False), ("pkg:NPM/a@1.0", False), ("pkg:Npm/a@1.0", False), ("pkg:1npm/a@1.0", False), ("pkg:n_pm/a@1.0", False), ("pkg:n.p+m-2/a@1.0", True),
                  ("pkg:npm/a@", False), ("pkg:npm/a", True), ("pkg:npm/a@b@1.0", True), ("pkg:npm/@a", False), ("pkg:generic/%40a@1.0", False), ("pkg:generic/a@1.0/b", True),
                  ("pkg:generic/ns/a@1.0", True), ("pkg:generic/x/y/z/a@1.0", True), ("pkg:generic/./a@1.0", True), ("pkg:generic/a%2Fb/c@1.0", True)]:
        add(p, ok)
    # Namespaces per type.
    for kind in ["maven", "golang", "github", "bitbucket", "composer"]:
        add(f"pkg:{kind}/lib@1.0", False)
        add(f"pkg:{kind}/ns/lib@1.0", True)
        add(f"pkg:{kind}/ns/sub/lib@1.0", True)
    for p, ok in [("pkg:swift/lib@1.0", False), ("pkg:swift/github.com/lib@1.0", False), ("pkg:swift/github/owner/lib@1.0", False), ("pkg:swift/github.com/owner/lib@1.0", True),
                  ("pkg:swift/git.example.org/a/b/lib@1.0", True), ("pkg:swift/owner/github.com/lib@1.0", False), ("pkg:swift/github%2Ecom/owner/lib@1.0", True),
                  ("pkg:npm/lib@1.0", True), ("pkg:npm/@scope/lib@1.0", True), ("pkg:npm/%40scope/lib@1.0", True), ("pkg:npm/scope/lib@1.0", False), ("pkg:npm/@/lib@1.0", False),
                  ("pkg:npm/@a/@b/lib@1.0", False), ("pkg:npm/@a/b/lib@1.0", False)]:
        add(p, ok)
    for kind in ["cargo", "gem", "pypi", "nuget", "hex", "pub", "cocoapods", "hackage", "conda"]:
        add(f"pkg:{kind}/lib@1.0", True)
        add(f"pkg:{kind}/ns/lib@1.0", False)
    for p, ok in [("pkg:clod/lib@1.0.0", False), ("pkg:clod/com.clodhub/presence@0.11.0", True), ("pkg:clod/com.clodhub/presence", True),
                  ("pkg:clod/com.clodhub/presence-class@1.1.0", True), ("pkg:clod/io.github.someone/thing@1.0.0", True),
                  ("pkg:clod/com/clodhub/presence@1.0.0", False), ("pkg:clod/com.clodhub/sub/presence@1.0.0", False)]:
        add(p, ok)
    for kind in ["generic", "deb", "docker", "oci"]:
        add(f"pkg:{kind}/lib@1.0", True)
        add(f"pkg:{kind}/ns/lib@1.0", True)
    # Qualifiers.
    q = "pkg:npm/a@1.0"
    for s, ok in [("?", False), ("?a", False), ("?a=", False), ("?=b", False), ("?A=b", False), ("?aB=c", False), ("?a=b&a=c", False), ("?1a=b", False), ("?_a=b", False), ("?.a=b", False),
                  ("?a=b=c", True), ("?a=b", True), ("?a1._-z=b", True), ("?a=b&c=d", True), ("?c=d&a=b", True), ("?a=b&", False), ("?&a=b", False), ("?a=b&&c=d", False),
                  ("?a=%20", False), ("?a=%41", True), ("?%61=b", False), ("?a=b?c", True), ("?a=b@c", True), ("?a=b/c", True), ("?type=jar&classifier=sources", True),
                  ("?repository_url=https%3A%2F%2Fr.example%2Fx", True), ("?a=b#c", True)]:
        add(q + s, ok)
    # Subpaths.
    for s, ok in [("#", False), ("#a", True), ("#a/b", True), ("#a//b", False), ("#../a", False), ("#./a", False), ("#a/..", False), ("#a/.", False), ("#/a", False), ("#a/", False),
                  ("#%2E%2E/a", False), ("#%2E/a", False), ("#...", True), ("#a#b", True), ("#a?b", True), ("#a%2Fb", True), ("#src/lib/index.js", True)]:
        add(q + s, ok)
    add("pkg:npm/a@1.0?a=b#c/d", True)
    add("pkg:npm/a?a=b#c", True)
    return out


def main():
    seen, rows = set(), []
    for purl, expected in cases():
        if purl in seen:
            continue
        seen.add(purl)
        parts = parse(purl)
        if expected is not None and (parts is not None) != expected:
            raise SystemExit(f"reference disagrees with the case: {purl!r} expected {expected}")
        row = {"purl": purl, "accept": parts is not None}
        if parts is not None:
            row["parts"] = parts
        rows.append(row)
    library = json.load(open(sys.argv[1]))
    refused = [r["purl"] for r in rows if r["purl"] in set(library) and not r["accept"]]
    if refused:
        raise SystemExit(f"library purls refused: {refused[:5]}")
    text = "[\n" + ",\n".join(json.dumps(r, ensure_ascii=True, separators=(",", ":")) for r in rows) + "\n]\n"
    open(sys.argv[2], "w", newline="\n").write(text)
    print(len(rows), sum(r["accept"] for r in rows))


main()
