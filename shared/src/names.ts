// Package names, versioned references and interface types by papers/package-urls.md; both clod and the catalogue pass
// shared/test/fixtures/package-name-cases.json.

export type PackageKind = "component" | "class" | "recipe";

export interface PackageParts {
  namespace: string;
  name: string;
  kind: PackageKind;
  version: string | null;
}

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const FIRST_LABEL = "[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?";
const NAMESPACE = new RegExp(`^${FIRST_LABEL}(?:\\.${LABEL})+$`);
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION = /^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})(?:-preview\.[1-9][0-9]{0,8})?$/;
const PACKAGE = /^pkg:clod\/([^/@?#%]+)\/([^/@?#%]+)(?:@([^/@?#%]*))?$/;
const INTERFACE = /^([^/@?#%]+)\/([^/@?#%]+)$/;
const RESERVED = new Set(["search"]);

export const PURL_PREFIX = "pkg:clod/";
// The namespace the short forms of clod's command line stand for.
export const DEFAULT_NAMESPACE = "com.clodhub";

export function isNamespace(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && NAMESPACE.test(value);
}

// A package's name without its namespace: also the catalogue's slug.
export function isPackageShortName(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 && NAME.test(value) && !RESERVED.has(value);
}

export function kindOf(name: string): PackageKind {
  return name.endsWith("-class") ? "class" : name.endsWith("-recipe") ? "recipe" : "component";
}

function parse(value: unknown, versioned: boolean): PackageParts | null {
  if (typeof value !== "string") return null;
  const m = PACKAGE.exec(value);
  if (!m || !isNamespace(m[1]) || !isPackageShortName(m[2])) return null;
  const [, namespace, name, version] = m as unknown as [string, string, string, string | undefined];
  const kind = kindOf(name);
  if (!versioned) return version === undefined ? { namespace, name, kind, version: null } : null;
  if (version === undefined || !VERSION.test(version) || (kind === "class" && version.includes("-"))) return null;
  return { namespace, name, kind, version };
}

// pkg:clod/<namespace>/<name>, without a version.
export function parsePackageName(value: unknown): PackageParts | null {
  return parse(value, false);
}

// pkg:clod/<namespace>/<name>@<version>.
export function parseReference(value: unknown): PackageParts | null {
  return parse(value, true);
}

export function isPackageName(value: unknown, kind?: PackageKind): value is string {
  const p = parsePackageName(value);
  return p !== null && (kind === undefined || p.kind === kind);
}

// <namespace>/<name>: an interface type or a data format name. Not a package URL.
export function parseInterfaceType(value: unknown): { namespace: string; name: string } | null {
  if (typeof value !== "string") return null;
  const m = INTERFACE.exec(value);
  if (!m || !isNamespace(m[1]) || !isPackageShortName(m[2])) return null;
  return { namespace: m[1]!, name: m[2]! };
}

export function isInterfaceType(value: unknown): value is string {
  return parseInterfaceType(value) !== null;
}

export function packageName(namespace: string, name: string): string {
  return `${PURL_PREFIX}${namespace}/${name}`;
}

export function versionedPurl(name: string, version: string): string {
  return `${name}@${version}`;
}

// The short form clod's command line accepts: <name> in the default namespace, <namespace>/<name> elsewhere.
export function shortForm(name: string, version?: string): string {
  const p = parsePackageName(name);
  const base = p === null ? name : p.namespace === DEFAULT_NAMESPACE ? p.name : `${p.namespace}/${p.name}`;
  return version === undefined ? base : `${base}@${version}`;
}

// The GitHub owner of a namespace: <owner> for io.github.<owner>, else the assignment in NAMESPACE_OWNERS
// ("com.clodhub=clodhub,org.example=someone"); null when none.
export function namespaceOwner(namespace: string, assignments: string | undefined): string | null {
  const github = /^io\.github\.([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)$/.exec(namespace);
  if (github) return github[1]!;
  for (const pair of (assignments ?? "").split(",")) {
    const [ns, owner] = pair.split("=").map((x) => x.trim());
    if (ns === namespace && owner) return owner.toLowerCase();
  }
  return null;
}
