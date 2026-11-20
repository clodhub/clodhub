// What the public recipe and component routes return. Never carries tokens or credentials.
import type { BuildReportView } from "./build-reports.js";
import type { BundlePointer, Channel, ClassInterface, ComponentDependency, MigrationSummary, Port, Quality, QualityLevel, Recipe, RecipeSlot, ReleaseChannel, ReleasePointer, EntryModule, SettingDeclaration, Suitability, Targets, VulnerabilityWaiver } from "./catalogue.js";
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

// A recipe's slot with its preferred component (`url` is its catalogue page, null when that version is not listed),
// what the catalogue says of that version, and the other catalogue components of its class: `count` of them that fit the
// class by the fit rule (newest listed version of each), `url` the catalogue list of components providing every type the
// class provides.
export interface RecipeSlotView extends Omit<RecipeSlot, "preferred"> {
  declaration: SlotClass;
  preferred: { name: string; version: string; url: string | null };
  catalogue: { description: string; suitability: Suitability; guardians: string[]; quality: Quality | null; thumbnail: string | null } | null;
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
  provides: Port[];
  requires: Port[];
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

// What a downloaded package is, in one place: the site pages, the plain-text pages and the documents quote this.
export interface PackageSummary {
  headline: string;
  parts: [label: string, text: string][];
  where: string;
  check: string;
}

export const COMPONENT_PACKAGE: PackageSummary = {
  headline: "The component itself: its source code in one archive file, not a link to code elsewhere.",
  parts: [
    ["Code", "The working implementation for each device or server it supports, as ordinary source files in those platforms' languages."],
    ["Contract", "The interfaces it provides and requires, written as data, with its documentation and instructions for an agent."],
    ["Tests", "The tests that prove it works, and the versions of the tools they need."],
    ["Manifest", "component.json lists every file with its fingerprint and the place it takes in your application, so nothing is copied that is not listed."],
    ["Not included", "The components it requires (each is a separate download), your settings, and any secret."],
  ],
  where: "The archive is a release file on the publisher's public GitHub repository. ourapps keeps this page's details and a pointer to the release; it does not hold or run the code.",
  check: "The digest is the sha256 fingerprint of the archive. aepm checks it before anything is copied. Installing copies the listed files into your application and runs none of the package's code.",
};

export const RECIPE_PACKAGE: PackageSummary = {
  headline: "The recipe itself: source code and a form, in one archive file, not a link to code elsewhere.",
  parts: [
    ["Recipe", "recipe.json holds the questions it asks, its slots (for each, the class of component it needs and the component it prefers, by exact version), the settings that connect them, the choice of providers by size, and the tested answer sets."],
    ["Application code", "The recipe's own application-specific component: the screens, artwork, sounds, translated text, rules and end-to-end tests that belong to this application and to no other."],
    ["Instructions", "INSTRUCTIONS.md tells an agent how to answer the questions and what each answer changes, and tells the developer which accounts are needed."],
    ["Not included", "The components that fill its slots. Each is a separate download, fetched by exact version and checked against its digest."],
  ],
  where: "The archive is a release file on the publisher's public GitHub repository. ourapps keeps this page's details and a pointer to the release; it does not hold or run the code.",
  check: "The digest is the sha256 fingerprint of the archive. aepm checks it before anything is copied. Installing copies the listed files into your application and runs none of the package's code.",
};

// The recipe's questions in the three groups of their `ask`, in recipe order within each.
export const ASK_HEADINGS = { required: "Ask the person", "unless-settled": "Ask unless the request settles it", default: "Defaults" } as const;

export function questionGroups<Q extends { ask: keyof typeof ASK_HEADINGS }>(questions: Q[]): { ask: keyof typeof ASK_HEADINGS; heading: string; questions: Q[] }[] {
  return (Object.keys(ASK_HEADINGS) as (keyof typeof ASK_HEADINGS)[]).map((ask) => ({ ask, heading: ASK_HEADINGS[ask], questions: questions.filter((q) => q.ask === ask) })).filter((g) => g.questions.length > 0);
}

export const QUALITY_TEXT = { packaged: "Packaged", reviewed: "Reviewed", "integration-tested": "Integration-tested", "live-tested": "Live-tested" } as const;
