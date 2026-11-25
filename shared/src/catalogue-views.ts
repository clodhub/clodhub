// What the public recipe and component routes return. Never carries tokens or credentials.
import type { BuildReportView } from "./build-reports.js";
import type { BundlePointer, Channel, ClassInterface, ComponentDependency, EntryPort, MigrationSummary, Quality, QualityLevel, Recipe, RecipeSlot, ReleaseChannel, ReleasePointer, EntryModule, SettingDeclaration, Suitability, Targets, VulnerabilityWaiver } from "./catalogue.js";
import type { ClassDescriptor, ClassReference, Compatibility, Foundations, Presentation } from "./foundations.js";

export const DEPRECATED_FILTERS = ["exclude", "include", "only"] as const;
export type DeprecatedFilter = typeof DEPRECATED_FILTERS[number];

// deprecated: the owner flagged it. orphaned: the owner deleted the account, so nobody maintains it.
export type DeprecationStatus = "deprecated" | "orphaned";
export type DeprecationReason = "owner-deprecated" | "owner-deleted";
export type EntryStatus = "active" | DeprecationStatus;

// One flagged entry an agent should know about. `version` is the version in use; the flag covers every version of the name.
// `via` names what pulls it in: empty for the entry itself, the recipe or component that names it otherwise.
export interface Deprecation {
  name: string;
  version: string;
  status: DeprecationStatus;
  reason: DeprecationReason;
  since: string;
  replacement?: string;
  via: string[];
}

// GET /api/{recipes,components}/:name/:version/deprecations: the entry and everything under it, resolved.
export interface DeprecationReport {
  name: string;
  version: string;
  status: EntryStatus;
  affected: boolean;
  checked: number;
  deprecations: Deprecation[];
}

export function deprecationLine(d: Deprecation): string {
  const what = d.status === "orphaned" ? "orphaned: its publisher deleted their account" : "deprecated by its publisher";
  const where = d.via.length === 0 ? "" : `, used by ${d.via.join(", ")}`;
  const instead = d.replacement ? `; replacement ${d.replacement}` : "";
  return `${d.name} ${d.version} is ${what} (${d.reason}, since ${d.since}${where})${instead}`;
}

export interface Publisher {
  slug: string;
  displayName: string;
}

export interface VersionRef {
  version: string;
  digest: string;
  publishedAt: string;
  channel: Channel;
  fixes: string[];
}

// The listing sorts: relevance (with q only), downloads in the last 30 days, trending (see agents.md), newest version
// first, name.
export const SORTS = ["relevance", "downloads", "trending", "updated", "name"] as const;
export type Sort = typeof SORTS[number];
export const PAGE_SIZE = 30;
// Above this, a listing gives its total as "more than".
export const COUNT_CAP = 10_000;

// What every listing card shows, read from the entry's summary row.
interface SummaryCommon {
  name: string;
  slug: string;
  version: string;
  category: string;
  platforms: string[];
  licence: string;
  quality: Quality | null;
  channel: Channel;
  // Known advisories affecting the version, waived ones excluded; null until the first check.
  vulnerabilities: number | null;
  // The main image's thumbnail, or null.
  thumbnail: string | null;
  downloads: number;
  updatedAt: string;
  publishedAt: string;
  tags: string[];
  // Null when the publisher deleted their account.
  publisher: Publisher | null;
  repository: string;
  url: string;
  status: EntryStatus;
  deprecations: Deprecation[];
}

export interface RecipeSummary extends SummaryCommon {
  title: string;
  summary: string;
  targets: Targets;
}

export interface ComponentSummary extends SummaryCommon {
  description: string;
  class: { name: string; version: string; title: string };
  targets: Targets;
}

export interface ImageView {
  url: string;
  thumbnail: string;
  caption: string;
  platform: string;
  width: number;
  height: number;
}

// The line of the shown version (MAJOR.MINOR) and the security releases on it.
export interface LineView {
  line: string;
  securityReleases: { version: string; fixes: string[]; publishedAt: string }[];
}

export interface VulnerabilitySummary {
  count: number | null;
  checkedAt: string | null;
  url: string;
}

interface VersionCommon {
  release: ReleaseChannel;
  line: LineView;
  images: ImageView[];
  vulnerabilitySummary: VulnerabilitySummary;
  vulnerabilityWaivers: VulnerabilityWaiver[];
  versionDownloads: number;
}

// A recipe's slot with its class (title, summary and page; its interfaces and settings are on the class page and the
// recipe's details), its preferred component (`url` is its catalogue page, null when that version is not listed), what the
// catalogue says of that version (its profiles with cost and load), and the other catalogue components of its class:
// `count` of them, `url` the catalogue list of components implementing the class.
export interface RecipeSlotView extends Omit<RecipeSlot, "preferred"> {
  classInfo: { title: string; summary: string; url: string };
  preferred: { name: string; version: string; url: string | null };
  catalogue: { description: string; profiles: SlotProfile[]; guardians: string[]; quality: Quality | null; thumbnail: string | null } | null;
  deprecation: Deprecation | null;
  // Other listed components implementing the slot's class.
  alternatives: { count: number; url: string };
}

export interface RecipeVersionView extends RecipeSummary, VersionCommon {
  foundations: FoundationSummary;
  foundationEvidence: "publisher-declared";
  digest: string;
  source: ReleasePointer;
  bundle: BundlePointer & { url: string };
  description: string;
  diagram: string | null;
  contents: PackageContents;
  components: RecipeSlotView[];
  jobs: Recipe["jobs"];
  scale: Recipe["scale"];
  questions: Recipe["questions"];
  connections: Recipe["connections"];
  tests: Recipe["tests"];
  instructions: string;
  versions: VersionRef[];
  // Build reports of any version of the recipe, newest first (spec section 6b).
  buildReports: BuildReportView[];
}

// `usedBy` lists the listed recipes whose newest version names this component in a slot, with each slot and whether the
// component is the slot's preferred one or a job candidate.
export interface ComponentVersionView extends ComponentSummary, VersionCommon {
  // The page text (Markdown) the publisher wrote: what the component is, then sections under level-2 headings.
  about: string;
  // The class it implements: its summary, its page, and how many other listed components implement it.
  classInfo: { summary: string; url: string; others: number; othersUrl: string };
  contents: PackageContents;
  provides: EntryPort[];
  requires: EntryPort[];
  foundations: FoundationSummary;
  foundationEvidence: "publisher-declared";
  digest: string;
  guardians: string[];
  settings: SettingDeclaration[];
  interfaceDigests: Record<string, string>;
  interfaceModules: Record<string, Record<string, EntryModule>>;
  dependencies: ComponentDependency[];
  suitability: Suitability;
  migration: MigrationSummary | null;
  source: ReleasePointer;
  bundle: BundlePointer & { url: string };
  versions: VersionRef[];
  usedBy: { name: string; slug: string; title: string; version: string; url: string; slots: { id: string; preferred: boolean }[] }[];
}

export interface SlotProfile {
  id: string;
  cost: Suitability["profiles"][number]["cost"];
  load: Record<string, number>;
}

// What the recipe details page adds to each slot: its class's declaration and the preferred component's full suitability.
export interface SlotDetails {
  id: string;
  declaration: SlotClass;
  suitability: Suitability | null;
}

// What a slot's class asks of a component: the interfaces, the settings schema the recipe writes, and the ids of the
// class's shared behaviour suites. The full descriptor (inventory, suite commands) is in the recipe's details.
export interface SlotClass {
  provides: ClassInterface[];
  requires: ClassInterface[];
  settings: ClassDescriptor["settings"];
  suites: string[];
}

export function slotClass(d: ClassDescriptor): SlotClass {
  return { provides: d.provides.map(({ type, version }) => ({ type, version })), requires: d.requires, settings: d.settings, suites: d.verification.map((v) => v.id) };
}

// A class the package implements, with each provided interface's entry modules per platform.
export interface ImplementedClass {
  reference: ClassReference;
  provides: { type: string; version: string; modules: Record<string, string[]> }[];
  requires: ClassInterface[];
  suites: string[];
}

// The package facts of a version page. The long lists are counted here and returned by the details route (`details`).
export interface FoundationSummary {
  licence: string;
  platforms: string[];
  implements: ImplementedClass[];
  runtimes: Compatibility["runtimes"];
  frameworks: Compatibility["frameworks"];
  styles: { scope: Compatibility["styles"]["scope"]; namespaces: number; conflicts: number };
  maintenance: Foundations["maintenance"];
  counts: { upstream: number; dependencies: number; classes: number; files: number; artefacts: number };
  details: string;
}

export function summariseFoundations(f: Foundations, details: string): FoundationSummary {
  const implemented = f.implements.flatMap((r) => f.classes.filter((c) => c.reference.name === r.name && c.reference.version === r.version && c.reference.digest === r.digest));
  return {
    licence: f.licence,
    platforms: f.platforms,
    implements: implemented.map(({ reference, descriptor: d }) => ({ reference, provides: d.provides.map(({ type, version, modules }) => ({ type, version, modules })), requires: d.requires, suites: d.verification.map((v) => v.id) })),
    runtimes: f.compatibility.runtimes,
    frameworks: f.compatibility.frameworks,
    styles: { scope: f.compatibility.styles.scope, namespaces: f.compatibility.styles.namespaces.length, conflicts: f.compatibility.styles.conflicts.length },
    maintenance: f.maintenance,
    counts: { upstream: f.upstream.length, dependencies: f.compatibility.dependencies.length, classes: f.classes.length, files: f.files.length, artefacts: f.artefacts.length },
    details,
  };
}

// GET /api/{recipes,components}/:name/:version/details: the package foundations in full.
export interface PackageDetails {
  name: string;
  version: string;
  foundationEvidence: "publisher-declared";
  foundations: Foundations;
}

// Where the signatures of a published version are, said the same way on every page.
export const SIGNATURES_NOTE = "The release signature, the guardian signature and the guardian's review report are files of the release beside the archive. aepm fetch downloads them and aepm install checks them against the owner's policy. The catalogue does not store them.";

// The catalogue list of components that provide every one of `types`: where a slot's alternatives are found.
export function providersPath(types: string[]): string {
  const query = [...new Set(types)].map((t) => `provides=${encodeURIComponent(t)}`).join("&");
  return `/components${query ? `?${query}` : ""}`;
}

// One category with how many listed entries it and its descendants hold.
export interface CategoryCount {
  id: string;
  title: string;
  parent: string | null;
  classes: number;
  components: number;
  recipes: number;
}

// GET /api/categories
export interface CategoryTree {
  categories: CategoryCount[];
}

// The listing parameters, the same for the page, its plain text and its JSON.
export interface ListQuery {
  q?: string;
  category?: string;
  class?: string;
  platform?: string;
  licence?: string;
  quality?: QualityLevel;
  certified?: boolean;
  channel?: Channel;
  // true: only entries whose newest version has no known vulnerability.
  secure?: boolean;
  publisher?: string;
  provides?: string[];
  requires?: string[];
  deprecated: DeprecatedFilter;
  sort: Sort;
  cursor?: string;
  limit: number;
}

interface ListCommon {
  query: ListQuery;
  // Exact up to COUNT_CAP; above it `approximate` is true and `count` is COUNT_CAP.
  total: { count: number; approximate: boolean };
  // Cursors for the next and previous pages, null at either end.
  next: string | null;
  previous: string | null;
  // The children of the chosen category (or the top categories), with counts.
  categories: CategoryCount[];
}

export interface RecipeList extends ListCommon {
  recipes: RecipeSummary[];
}

export interface ComponentList extends ListCommon {
  components: ComponentSummary[];
}

// A class entry: the class.json fields shown on its page, and how many listed components implement it.
export interface ClassSummary {
  name: string;
  slug: string;
  version: string;
  title: string;
  summary: string;
  category: string;
  presentation: Presentation;
  implementations: number;
  publisher: Publisher | null;
  url: string;
}

export interface ClassList {
  classes: ClassSummary[];
  total: { count: number; approximate: boolean };
  next: string | null;
  previous: string | null;
  categories: CategoryCount[];
}

// A component that implements a class, as the class page compares them.
export interface Implementation {
  name: string;
  slug: string;
  version: string;
  description: string;
  thumbnail: string | null;
  quality: Quality | null;
  platforms: string[];
  downloads: number;
  vulnerabilities: number | null;
  url: string;
}

export interface ClassVersionView extends ClassSummary {
  digest: string;
  provides: ClassDescriptor["provides"];
  requires: ClassDescriptor["requires"];
  settings: ClassDescriptor["settings"];
  suites: { id: string; argv: string[]; network: boolean; timeoutSeconds: number }[];
  versions: { version: string; digest: string; publishedAt: string }[];
  // The most downloaded implementations of this class version, at most 100.
  implementationList: Implementation[];
}

export interface Advisory {
  id: string;
  summary: string;
  severity: string | null;
  affected: string[];
  fixedIn: string[];
  // The publisher's reason when the version waives it.
  waived: string | null;
}

// GET /api/{recipes,components}/:name/:version/vulnerabilities
export interface VulnerabilityReport {
  name: string;
  version: string;
  checkedAt: string | null;
  // Null before the first check, and when OSV refused one of the version's purls (listed in `unqueryable`).
  count: number | null;
  advisories: Advisory[];
  unqueryable: string[];
}

// bundle-unavailable: the publisher's account is deleted and the release is not public, so no download link exists.
export interface BundleLink {
  name: string;
  version: string;
  digest: string;
  asset: string;
  assetDigest: string;
  status: "available" | "bundle-unavailable";
  url: string | null;
  expiresAt: string | null;
  deprecations: Deprecation[];
}

// Where a package's archive is and what installing it does, said the same way on every page.
export const PACKAGE_WHERE = "The archive is a release file on the publisher's public GitHub repository; ourapps keeps this page and a pointer to the release, not the code.";
export const PACKAGE_CHECK = "aepm checks the archive's sha256 fingerprint before anything is copied, and installing runs none of the package's code.";

// What one package archive holds, from its file list: the files by kind, and where the installed ones go.
export interface ContentGroup {
  label: string;
  count: number;
  // What the group holds: its folders with how many files each ("android (52)"), or its file names when it has no folders;
  // at most six.
  examples: string[];
}

export interface PackageContents {
  files: number;
  groups: ContentGroup[];
  installed: { count: number; root: string; folders: { folder: string; count: number }[] };
}

const CONTENT_LABELS: Record<string, string> = {
  implementation: "Source code",
  tests: "Tests",
  fixtures: "Test data",
  interfaces: "Interface documents",
  classes: "Class files: the class's interfaces and shared checks",
  examples: "Examples",
  visual: "Diagrams",
  images: "Images of it as built",
  notices: "Licence notices of upstream code",
  page: "Page text and diagram",
  assets: "Artwork and sounds",
  locales: "Translations",
  rules: "Rules",
  scripts: "Scripts",
};
const CONTENT_ORDER = ["implementation", "tests", "fixtures", "interfaces", "classes", "examples", "assets", "locales", "rules", "page", "images", "visual", "scripts", "notices"];

// A group's folders with their file counts, in order of first appearance, or its file names when it has no folders.
function groupExamples(paths: string[]): string[] {
  if (!paths.some((path) => path.includes("/"))) return paths.slice(0, 6);
  const folders = new Map<string, number>();
  for (const path of paths) {
    const at = path.indexOf("/");
    const key = at < 0 ? path : `${path.slice(0, at)}/`;
    folders.set(key, (folders.get(key) ?? 0) + 1);
  }
  return [...folders.entries()].slice(0, 6).map(([folder, n]) => (folder.endsWith("/") ? `${folder} (${n})` : folder));
}

// Whether a group holds more than its examples show.
export const groupHasMore = (g: ContentGroup): boolean => g.examples.reduce((n, x) => n + (Number(/\((\d+)\)$/.exec(x)?.[1]) || 1), 0) < g.count;

export function packageContents(f: Pick<Foundations, "files" | "artefacts">): PackageContents {
  const groups = new Map<string, string[]>();
  for (const file of f.files) {
    const at = file.path.indexOf("/");
    const key = at < 0 ? "" : file.path.slice(0, at);
    groups.set(key, [...(groups.get(key) ?? []), at < 0 ? file.path : file.path.slice(at + 1)]);
  }
  const rank = (k: string) => (k === "" ? -1 : CONTENT_ORDER.includes(k) ? CONTENT_ORDER.indexOf(k) : CONTENT_ORDER.length);
  const destinations = f.artefacts.map((a) => a.destination);
  const first = destinations[0]?.split("/") ?? [];
  // The deepest folder every installed file shares, at most components/<name>/.
  let depth = 0;
  while (depth < Math.min(2, first.length - 1) && destinations.every((d) => d.split("/")[depth] === first[depth])) depth++;
  const root = depth === 0 ? "" : `${first.slice(0, depth).join("/")}/`;
  const folders = new Map<string, number>();
  for (const d of destinations) {
    const rest = d.slice(root.length).split("/");
    const folder = rest.length > 1 ? rest[0]! : "(top level)";
    folders.set(folder, (folders.get(folder) ?? 0) + 1);
  }
  return {
    files: f.files.length,
    groups: [...groups.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([key, paths]) => ({ label: key === "" ? "Documents and manifests" : (CONTENT_LABELS[key] ?? `${key}/`), count: paths.length, examples: groupExamples(paths) })),
    installed: { count: f.artefacts.length, root, folders: [...folders.entries()].map(([folder, count]) => ({ folder, count })) },
  };
}

const words = (items: string[]): string => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

// How a recipe uses a component, in words: the slot of its class, what the recipe connects and the settings it writes.
export function recipeUseSentence(v: { name: string; class: { name: string; version: string; title: string }; provides: { id: string }[]; requires: { id: string; optional?: boolean }[]; settings: { id: string; required: boolean; hasDefault: boolean }[] }): string {
  const needed = v.requires.filter((r) => !r.optional).map((r) => r.id);
  const optional = v.requires.filter((r) => r.optional).map((r) => r.id);
  const always = v.settings.filter((s) => s.required && !s.hasDefault).map((s) => s.id);
  const parts = [
    `A recipe uses it through a slot of class ${v.class.title} (${v.class.name} ${v.class.version}), naming ${v.name} as the slot's preferred component or substituting it for another component of the class.`,
    v.provides.length > 0 ? `The recipe connects what it provides (${words(v.provides.map((p) => p.id))}) to the slots that use ${v.provides.length === 1 ? "it" : "them"}.` : "",
    needed.length > 0 ? `It fills what the component needs (${words(needed)}) from slots whose components provide ${needed.length === 1 ? "it" : "them"}${optional.length > 0 ? `; ${words(optional)} may stay unconnected` : ""}.` : optional.length > 0 ? `What it can use (${words(optional)}) may stay unconnected.` : "",
    v.settings.length === 0 ? "It has no settings." : `The recipe sets ${words(v.settings.map((s) => s.id))}${always.length > 0 ? `; ${words(always)} ${always.length === 1 ? "has" : "have"} no default, so the recipe always sets ${always.length === 1 ? "it" : "them"}` : "; any it leaves out takes its default"}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

// A page description in parts: the text before its first level-2 heading, then each level-2 section.
export function markdownSections(markdown: string): { intro: string; sections: { heading: string; body: string }[] } {
  const parts = `\n${markdown}`.split(/\n## /);
  const intro = parts.shift()!.trim();
  return {
    intro,
    sections: parts.map((part) => {
      const at = part.indexOf("\n");
      return { heading: (at < 0 ? part : part.slice(0, at)).trim(), body: at < 0 ? "" : part.slice(at + 1).trim() };
    }),
  };
}

// The recipe's questions in the three groups of their `ask`, in recipe order within each.
export const ASK_HEADINGS = { required: "Ask the person", "unless-settled": "Ask unless the request settles it", default: "Defaults" } as const;

export function questionGroups<Q extends { ask: keyof typeof ASK_HEADINGS }>(questions: Q[]): { ask: keyof typeof ASK_HEADINGS; heading: string; questions: Q[] }[] {
  return (Object.keys(ASK_HEADINGS) as (keyof typeof ASK_HEADINGS)[]).map((ask) => ({ ask, heading: ASK_HEADINGS[ask], questions: questions.filter((q) => q.ask === ask) })).filter((g) => g.questions.length > 0);
}

export const QUALITY_TEXT = { packaged: "Packaged", reviewed: "Reviewed", "integration-tested": "Integration-tested", "live-tested": "Live-tested" } as const;

// One step of building an application from a recipe: what to do, the command when there is one, and why.
export interface BuildStep {
  text: string;
  command: string | null;
}

// The aepm steps for any recipe version, from catalogue data: its short name, version, archive digest and the path of
// its instructions inside the archive.
export function recipeBuildSteps(v: { slug: string; version: string; digest: string; instructions: string }): BuildStep[] {
  const id = `${v.slug}@${v.version}`;
  const file = v.instructions.split("/").at(-1)!;
  const archive = `store/objects/${v.digest.replace(/^sha256:/, "")}.tar`;
  return [
    { text: "Get aepm", command: "git clone https://github.com/ourapps-ae/aepm && export PYTHONPATH=$PWD/aepm" },
    { text: "Fetch the recipe and the component it prefers for each slot; every sha256 digest and signature is checked", command: `python3 -m aepm fetch ${id} --with-dependencies --store store` },
    { text: `Read the recipe's own instructions: this writes ${v.instructions} from the fetched archive into the current folder. The same command works in a macOS or Linux shell and in PowerShell or cmd on Windows 10 version 1803 or later`, command: `tar -xf ${archive} ${v.instructions}` },
    { text: "The questions as JSON with toAsk and followUps. Answer from the person's description. Tell the person how many questions toAsk lists, ask them in one round, include as conditional questions in that round the followUps whose condition one of those answers could meet, and add no others", command: `python3 -m aepm questions ${id} --store store` },
    { text: `Write answers.json (question id to answer), then design. For another component of a slot's class than the preferred one: python3 -m aepm alternatives ${id} SLOT --store store lists the components that fit, then add --substitute SLOT=NAME@VERSION to design`, command: `python3 -m aepm design ${id} --store store --answers answers.json --out definition.json` },
    { text: "Check this machine's build tools for the chosen targets; add --install to install the missing ones it can", command: `python3 -m aepm doctor ${id} --store store --answers answers.json` },
    { text: "Resolve the exact packages", command: "python3 -m aepm resolve definition.json --catalogue store/catalogue.json --out lock.json" },
    { text: `Make the owner policy: Level N's release and guardian keys from https://ourapps.app/policy/levelnpolicy.json plus your own owner key (python3 -m aepm.test_identities DIR makes a disposable one); ${file} shows how`, command: null },
    { text: "Install", command: "python3 -m aepm install definition.json --lock lock.json --store store --policy policy.json --target app" },
    { text: "Let verify run the installed packages' checks: the policy's trustedExecution lists the digest of each package in lock.json", command: `python3 -c 'import json; p=json.load(open("policy.json")); p["trustedExecution"]=sorted(x["digest"] for x in json.load(open("lock.json"))["packages"]); json.dump(p, open("policy.json", "w"), indent=2)'` },
    { text: "Run every package's checks on the installed application; --allow-network lets the checks' npm ci download", command: "python3 -m aepm verify app --policy policy.json --trusted --allow-network" },
    { text: `Build and run each target as ${file} says`, command: null },
  ];
}

// The most characters of a recipe's own "Building it" section a page shows.
export const BUILDING_IT_CHARACTERS = 6_000;

// The recipe author's "Building it" section of the page description (its heading through the next heading of the same
// or a higher level), without the heading; null when there is none. A longer section is cut at BUILDING_IT_CHARACTERS.
export function buildingItSection(description: string): { text: string; cut: boolean } | null {
  const lines = description.split("\n");
  let fence = false;
  let start = -1;
  let level = 0;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    if (start < 0 && /^building it$/i.test(m[2]!)) {
      start = i + 1;
      level = m[1]!.length;
    } else if (start >= 0 && m[1]!.length <= level) {
      end = i;
      break;
    }
  }
  if (start < 0) return null;
  const text = lines.slice(start, end).join("\n").trim();
  if (text === "") return null;
  return text.length > BUILDING_IT_CHARACTERS ? { text: `${text.slice(0, BUILDING_IT_CHARACTERS).replace(/\s+\S*$/, "")} ...`, cut: true } : { text, cut: false };
}
