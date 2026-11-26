"""Builds package-name-cases.json: package names, versioned references and interface types, from a Python reference
of papers/package-urls.md, written separately from the clod and catalogue validators.

usage: python3 make-package-name-cases.py package-name-cases.json
"""
import json
import re
import sys

LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
FIRST_LABEL = r"[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?"
NAMESPACE = re.compile(rf"{FIRST_LABEL}(?:\.{LABEL})+")
NAME = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*")
VERSION = re.compile(r"(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})(?:-preview\.[1-9][0-9]{0,8})?")
RESERVED = {"search"}
PACKAGE = re.compile(r"pkg:clod/([^/@?#%]+)/([^/@?#%]+)(?:@([^/@?#%]*))?")
INTERFACE = re.compile(r"([^/@?#%]+)/([^/@?#%]+)")


def namespace_ok(value):
    return len(value) <= 100 and NAMESPACE.fullmatch(value) is not None


def name_ok(value):
    return 2 <= len(value) <= 64 and NAME.fullmatch(value) is not None and value not in RESERVED


def kind_of(name):
    return "class" if name.endswith("-class") else "recipe" if name.endswith("-recipe") else "component"


def parse(what, value):
    if not isinstance(value, str):
        return None
    if what == "interface":
        m = INTERFACE.fullmatch(value)
        if m is None or not namespace_ok(m.group(1)) or not name_ok(m.group(2)):
            return None
        return {"namespace": m.group(1), "name": m.group(2)}
    m = PACKAGE.fullmatch(value)
    if m is None or not namespace_ok(m.group(1)) or not name_ok(m.group(2)):
        return None
    namespace, name, version = m.groups()
    kind = kind_of(name)
    if what == "package":
        if version is not None:
            return None
    elif version is None or VERSION.fullmatch(version) is None or (kind == "class" and "-" in version):
        return None
    return {"namespace": namespace, "name": name, "kind": kind, "version": version}


def cases():
    out = []
    add = lambda what, value, accept: out.append((what, value, accept))
    ns = "com.clodhub"
    label63 = "a" * 63
    long_namespace = "com." + ".".join(["b" * 47, "c" * 48])
    assert len(long_namespace) == 100
    # Package names.
    for value, ok in [
        (f"pkg:clod/{ns}/presence", True), (f"pkg:clod/{ns}/presence-class", True), (f"pkg:clod/{ns}/ourpoker-recipe", True),
        ("pkg:clod/io.github.george-mcintyre/card-deck", True), ("pkg:clod/io.github.0xabc/thing", True),
        ("pkg:clod/org.example.sub/thing", True), ("pkg:clod/xn--bcher-kva.example/thing", True), (f"pkg:clod/{ns}/a2", True),
        (f"pkg:clod/{ns}/x-class", True), (f"pkg:clod/{ns}/recipe-book", True), (f"pkg:clod/{ns}/classic", True),
        (f"pkg:clod/{ns}/class", True), (f"pkg:clod/{ns}/web3", True), (f"pkg:clod/{ns}/" + "a" * 64, True),
        (f"pkg:clod/{long_namespace}/thing", True), (f"pkg:clod/com.{label63}/thing", True),
        ("clodhub/presence", False), (f"{ns}/presence", False), ("pkg:clod/presence", False), ("pkg:clod/com/presence", False),
        (f"pkg:clod/{ns}/sub/presence", False), (f"pkg:CLOD/{ns}/presence", False), (f"PKG:clod/{ns}/presence", False),
        (f"pkg://clod/{ns}/presence", False), (f"pkg:/clod/{ns}/presence", False), ("pkg:github/clodhub/presence", False),
        ("pkg:clod/Com.Clodhub/presence", False), (f"pkg:clod/{ns}/Presence", False), (f"pkg:clod/{ns}/presence@0.11.0", False),
        (f"pkg:clod/{ns}/presence?x=y", False), (f"pkg:clod/{ns}/presence#a", False), (f"pkg:clod/{ns}/p", False),
        (f"pkg:clod/{ns}/" + "a" * 65, False), (f"pkg:clod/{ns}/-presence", False), (f"pkg:clod/{ns}/presence-", False),
        (f"pkg:clod/{ns}/pre--sence", False), (f"pkg:clod/{ns}/2presence", False), (f"pkg:clod/{ns}/pres_ence", False),
        (f"pkg:clod/{ns}/pres.ence", False), (f"pkg:clod/{ns}/search", False), (f"pkg:clod/{ns}/%70resence", False),
        ("pkg:clod/com%2Eclodhub/presence", False), ("pkg:clod/1com.clodhub/x2", False), ("pkg:clod/com.-clodhub/x2", False),
        ("pkg:clod/com.clodhub-/x2", False), ("pkg:clod/com..clodhub/x2", False), ("pkg:clod/.com.clodhub/x2", False),
        ("pkg:clod/com.clodhub./x2", False), ("pkg:clod/com_clodhub.x/x2", False), ("pkg:clod/com-.clodhub/x2", False),
        (f"pkg:clod/{long_namespace}b/thing", False), (f"pkg:clod/com.{label63}a/thing", False), (f"pkg:clod/{ns}/presence/", False),
        (f" pkg:clod/{ns}/presence", False), (f"pkg:clod/{ns}/presence ", False), (f"pkg:clod/{ns}/", False), (f"pkg:clod/{ns}/-class", False),
        (f"pkg:clod//{ns}/presence", False), ("", False),
    ]:
        add("package", value, ok)
    # Versioned references.
    for value, ok in [
        (f"pkg:clod/{ns}/presence@0.11.0", True), (f"pkg:clod/{ns}/presence@0.11.0-preview.1", True),
        (f"pkg:clod/{ns}/presence-class@1.1.0", True), (f"pkg:clod/{ns}/ourpoker-recipe@0.13.0", True),
        (f"pkg:clod/{ns}/ourpoker-recipe@0.13.0-preview.2", True), (f"pkg:clod/{ns}/presence@999999999.0.0", True),
        (f"pkg:clod/{ns}/presence@0.0.0", True),
        (f"pkg:clod/{ns}/presence", False), (f"pkg:clod/{ns}/presence@", False), (f"pkg:clod/{ns}/presence@v0.11.0", False),
        (f"pkg:clod/{ns}/presence@0.11", False), (f"pkg:clod/{ns}/presence@01.0.0", False), (f"pkg:clod/{ns}/presence@1.0.0-preview.0", False),
        (f"pkg:clod/{ns}/presence@1.0.0-preview", False), (f"pkg:clod/{ns}/presence@1.0.0-beta.1", False), (f"pkg:clod/{ns}/presence@1.0.0+build", False),
        (f"pkg:clod/{ns}/presence@1000000000.0.0", False), (f"pkg:clod/{ns}/presence-class@1.1.0-preview.1", False),
        (f"pkg:clod/{ns}/presence@0.11.0?checksum=sha256:ab", False), (f"pkg:clod/{ns}/presence@0.11.0#x", False),
        (f"pkg:clod/{ns}/presence@0.11.0@1", False), ("clodhub/presence@0.11.0", False), (f"{ns}/presence@0.11.0", False),
        (f"pkg:clod/{ns}/presence@0.11.0 ", False), (f"pkg:clod/{ns}/Presence@0.11.0", False),
    ]:
        add("reference", value, ok)
    # Interface types and data format names.
    for value, ok in [
        (f"{ns}/card-deck", True), (f"{ns}/game-adapter", True), (f"{ns}/display-mode-configuration", True),
        (f"{ns}/chip-ledger-records", True), ("io.github.someone/thing", True),
        ("ae/card-deck", False), ("clodhub/card-deck", False), (f"pkg:clod/{ns}/card-deck", False), (f"{ns}/card-deck@1.0.0", False),
        (f"{ns}/Card-deck", False), (f"{ns}/card_deck", False), (f"{ns}/", False), (f"{ns}/a", False), (f"{ns}/card-deck/x", False),
        ("card-deck", False), (f"{ns}/search", False),
    ]:
        add("interface", value, ok)
    return out


def main():
    rows, seen = [], set()
    for what, value, expected in cases():
        if (what, value) in seen:
            raise SystemExit(f"duplicate case: {what} {value!r}")
        seen.add((what, value))
        parts = parse(what, value)
        if (parts is not None) != expected:
            raise SystemExit(f"reference disagrees with the case: {what} {value!r} expected {expected}")
        row = {"what": what, "value": value, "accept": parts is not None}
        if parts is not None:
            row["parts"] = parts
        rows.append(row)
    text = "[\n" + ",\n".join(json.dumps(r, ensure_ascii=True, separators=(",", ":")) for r in rows) + "\n]\n"
    open(sys.argv[1], "w", newline="\n").write(text)
    print(len(rows), sum(r["accept"] for r in rows))


main()
