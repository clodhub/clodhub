// Catalogue: names, versions, recipe.json (format 3) and the catalogue entries for components, recipes and classes.
// Package names are package URLs (papers/package-urls.md, shared/src/names.ts). Format authority: .opencode/knowledge/component-standard.md
// in the workspace root.
import { isAppTarget, type AppTarget } from "./targets.js";
import { checkCondition, confinements, type Condition, type ConditionExpr } from "./conditions.js";
import { valueProblem } from "./json-schema.js";
import { isInterfaceType, isPackageName, isPackageShortName, parsePackageName, type PackageKind } from "./names.js";
import { CATEGORY_PATH, CLASS_FORMAT, canonical, classDescriptor, descriptorDigest, graphProblems, isClassReference, selectedTargets, validateDescriptor, validateFoundations, type ClassDescriptor, type ClassReference, type Foundations } from "./foundations.js";

// suitability.json and migration.json.
export const CATALOGUE_FORMAT = 1;
// The bodies of the publish routes: recipe and class entries, and component entries.
export const ENTRY_FORMAT = 3;
export const COMPONENT_ENTRY_FORMAT = 4;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
// A package version: three integers, and for a preview release exactly -preview.N with N a positive integer.
const PACKAGE_VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(-preview\.[1-9]\d{0,8})?$/;
// OSV, GitHub and CVE advisory identifiers.
const ADVISORY = /^(GHSA(-[23456789cfghjmpqrvwx]{4}){3}|CVE-\d{4}-\d{4,7}|[A-Z][A-Z0-9]{1,15}-[A-Za-z0-9._:-]{1,60})$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const ASSET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;


export const QUESTION_TYPES = ["set", "choice", "boolean", "integer", "text", "secretRef", "account"] as const;
export type QuestionType = typeof QUESTION_TYPES[number];

export const COST_KINDS = ["free", "paid", "metered", "none"] as const;
export type CostKind = typeof COST_KINDS[number];

export const LIMITS = {
  recipeJson: 200_000,
  description: 20_000,
  diagram: 200_000,
  summary: 300,
  title: 80,
  componentDescription: 500,
  components: 100,
  classConfiguration: 20_000,
  settings: 100,
  questions: 60,
  connections: 500,
  answerSets: 50,
  tags: 20,
  screenshots: 10,
} as const;

// A catalogue slug is a package's name without its namespace, unique across namespaces.
export function isCatalogueSlug(value: unknown): value is string {
  return isPackageShortName(value);
}

// A package name pkg:clod/<namespace>/<name>, of the given kind when one is named.
export function isCatalogueName(value: unknown, kind?: PackageKind): value is string {
  return isPackageName(value, kind);
}

// "pkg:clod/com.clodhub/seating" -> { namespace: "com.clodhub", slug: "seating" }
export function splitName(value: unknown): { namespace: string; slug: string } | null {
  const p = parsePackageName(value);
  return p === null ? null : { namespace: p.namespace, slug: p.name };
}

// The short name (slug) of a package name: its last segment.
export function slugOf(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

const KIND_SUFFIX: Record<PackageKind, string> = { component: "a name ending in neither -class nor -recipe", class: "a name ending in -class", recipe: "a name ending in -recipe" };
// What a name of the kind looks like, for messages.
export function nameRule(kind: PackageKind): string {
  return `a package name pkg:clod/<namespace>/<name> with ${KIND_SUFFIX[kind]}`;
}

export function isVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION.test(value);
}

export function isPackageVersion(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && PACKAGE_VERSION.test(value);
}

export function isAdvisoryId(value: unknown): value is string {
  return typeof value === "string" && ADVISORY.test(value);
}

// Semantic version order: a pre-release comes before its release; pre-release parts compare as numbers or text.
export function compareVersions(a: string, b: string): number {
  const [coreA, preA] = splitPre(a);
  const [coreB, preB] = splitPre(b);
  const x = coreA.split(".").map(Number);
  const y = coreB.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  if (preA === preB) return 0;
  if (preA === null) return 1;
  if (preB === null) return -1;
  const p = preA.split(".");
  const q = preB.split(".");
  for (let i = 0; i < Math.max(p.length, q.length); i++) {
    if (p[i] === undefined) return -1;
    if (q[i] === undefined) return 1;
    if (p[i] === q[i]) continue;
    const m = /^\d+$/.test(p[i]);
    const n = /^\d+$/.test(q[i]);
    if (m && n) return Number(p[i]) < Number(q[i]) ? -1 : 1;
    if (m !== n) return m ? -1 : 1;
    return p[i] < q[i] ? -1 : 1;
  }
  return 0;
}

function splitPre(v: string): [string, string | null] {
  const at = v.indexOf("-");
  return at < 0 ? [v, null] : [v.slice(0, at), v.slice(at + 1)];
}

// MAJOR.MINOR of a version: the line its security releases share.
export function versionLine(v: string): string {
  return splitPre(v)[0].split(".").slice(0, 2).join(".");
}

export function newestVersion(versions: string[]): string | null {
  return versions.reduce<string | null>((best, v) => (best === null || compareVersions(v, best) > 0 ? v : best), null);
}

export function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

export function isRepository(value: unknown): value is string {
  return typeof value === "string" && REPOSITORY.test(value) && !value.endsWith(".git");
}

export function isReleaseTag(value: unknown): value is string {
  return typeof value === "string" && TAG.test(value) && !value.includes("..") && !value.endsWith("/");
}

export function isAssetName(value: unknown): value is string {
  return typeof value === "string" && ASSET.test(value) && !value.includes("..");
}

// A path inside a package: relative, forward slashes, no parent steps.
export function isPackagePath(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 200 && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0") && value.split("/").every((p) => p !== "" && p !== "." && p !== "..");
}

export type Result<K extends string, T> = ({ ok: true } & { [P in K]: T }) | { ok: false; errors: string[] };

type Json = unknown;
type Rec = Record<string, Json>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function text(value: unknown, max: number, min = 1): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

function unknownKeys(record: Rec, allowed: readonly string[], where: string, errors: string[]): void {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) errors.push(`${where}: unknown field ${key.slice(0, 40)}`);
}

function stringList(value: unknown, where: string, errors: string[], opts: { max: number; item: (v: unknown) => boolean; what: string; unique?: boolean }): string[] {
  if (!Array.isArray(value) || value.length > opts.max) {
    errors.push(`${where} must be a list of at most ${opts.max} ${opts.what}`);
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (!opts.item(item)) {
      errors.push(`${where} has an invalid entry: ${String(item).slice(0, 40)}`);
      continue;
    }
    if (opts.unique !== false && out.includes(item as string)) errors.push(`${where} lists ${String(item)} twice`);
    out.push(item as string);
  }
  return out;
}

// ---------------------------------------------------------------- shared pieces

export interface Targets {
  client: AppTarget[];
  server: string[];
}

function readTargets(value: unknown, where: string, errors: string[]): Targets {
  const out: Targets = { client: [], server: [] };
  if (!isRecord(value)) {
    errors.push(`${where} must be an object with client and server lists`);
    return out;
  }
  unknownKeys(value, ["client", "server"], where, errors);
  out.client = stringList(value.client, `${where}.client`, errors, { max: 6, item: isAppTarget, what: "client targets (ios, android, web, macos, windows, tvos)" }) as AppTarget[];
  out.server = stringList(value.server ?? [], `${where}.server`, errors, { max: 10, item: (v) => typeof v === "string" && SLUG.test(v) && v.length <= 40, what: "server target names" });
  return out;
}

function readTags(value: unknown, where: string, errors: string[]): string[] {
  return stringList(value ?? [], where, errors, { max: LIMITS.tags, item: (v) => typeof v === "string" && SLUG.test(v) && v.length <= 30, what: "lowercase tags" });
}

export interface ReleasePointer {
  repository: string;
  tag: string;
}

export interface BundlePointer {
  asset: string;
  digest: string;
}

function readRelease(source: unknown, bundle: unknown, errors: string[]): { source: ReleasePointer; bundle: BundlePointer } {
  const out = { source: { repository: "", tag: "" }, bundle: { asset: "", digest: "" } };
  if (!isRecord(source)) errors.push("source must be an object with repository and tag");
  else {
    unknownKeys(source, ["repository", "tag"], "source", errors);
    if (!isRepository(source.repository)) errors.push("source.repository must be owner/name");
    else out.source.repository = source.repository;
    if (!isReleaseTag(source.tag)) errors.push("source.tag must be a release tag");
    else out.source.tag = source.tag;
  }
  if (!isRecord(bundle)) errors.push("bundle must be an object with asset and digest");
  else {
    unknownKeys(bundle, ["asset", "digest"], "bundle", errors);
    if (!isAssetName(bundle.asset)) errors.push("bundle.asset must be a release asset file name");
    else out.bundle.asset = bundle.asset;
    if (!isDigest(bundle.digest)) errors.push("bundle.digest must be sha256:<64 lowercase hex>");
    else out.bundle.digest = bundle.digest;
  }
  return out;
}

// ---------------------------------------------------------------- release channel, images, waivers, quality

export const CHANNELS = ["security", "features", "preview"] as const;
export type Channel = typeof CHANNELS[number];

// security: a patch above 0 that only fixes the listed advisories; features: patch 0; preview: a pre-release.
export interface ReleaseChannel {
  channel: Channel;
  fixes: string[];
}

export function readReleaseChannel(value: unknown, version: unknown, errors: string[]): ReleaseChannel {
  const out: ReleaseChannel = { channel: "features", fixes: [] };
  if (!isRecord(value)) {
    errors.push("release must be an object with channel and fixes");
    return out;
  }
  unknownKeys(value, ["channel", "fixes"], "release", errors);
  if (!(CHANNELS as readonly unknown[]).includes(value.channel)) {
    errors.push(`release.channel must be one of ${CHANNELS.join(", ")}`);
    return out;
  }
  out.channel = value.channel as Channel;
  out.fixes = stringList(value.fixes, "release.fixes", errors, { max: 50, item: isAdvisoryId, what: "advisory ids (OSV, GHSA or CVE)" });
  if (typeof version !== "string" || !isPackageVersion(version)) return out;
  const [core, pre] = splitPre(version);
  const patch = Number(core.split(".")[2]);
  if (out.channel === "preview" && pre === null) errors.push("release.channel preview needs a pre-release version such as 0.9.0-preview.1");
  if (out.channel !== "preview" && pre !== null) errors.push(`release.channel ${out.channel} cannot have a pre-release version; a pre-release is a preview`);
  if (out.channel === "features" && patch !== 0) errors.push("release.channel features needs patch 0: a security release is the only release with a patch above 0");
  if (out.channel === "security" && patch === 0) errors.push("release.channel security needs a patch above 0 on an existing line");
  if (out.channel === "security" && out.fixes.length === 0) errors.push("release.fixes must list the advisories a security release fixes");
  if (out.channel !== "security" && out.fixes.length > 0) errors.push(`release.fixes must be empty for ${out.channel}`);
  return out;
}

// An image of the package as built: the full image and its 480-pixel-wide WebP thumbnail, both uploaded by sha256.
export interface PackageImage {
  digest: string;
  thumbnail: string;
  caption: string;
  platform: string;
  width: number;
  height: number;
}

export const IMAGE_LIMITS = { images: 12, bytes: 2 * 1024 * 1024, caption: 140, thumbnailWidth: 480, side: 16384 } as const;

export function readImages(value: unknown, platforms: string[], errors: string[]): PackageImage[] {
  if (!Array.isArray(value) || value.length > IMAGE_LIMITS.images) {
    errors.push(`images must be a list of at most ${IMAGE_LIMITS.images} images`);
    return [];
  }
  const out: PackageImage[] = [];
  value.forEach((raw, i) => {
    const at = `images[${i}]`;
    if (!isRecord(raw)) return void errors.push(`${at} must be an object`);
    unknownKeys(raw, ["digest", "thumbnail", "caption", "platform", "width", "height"], at, errors);
    if (!isDigest(raw.digest)) errors.push(`${at}.digest must be sha256:<64 lowercase hex> of the image`);
    if (!isDigest(raw.thumbnail)) errors.push(`${at}.thumbnail must be sha256:<64 lowercase hex> of its WebP thumbnail`);
    if (!text(raw.caption, IMAGE_LIMITS.caption)) errors.push(`${at}.caption must be text of at most ${IMAGE_LIMITS.caption} characters`);
    if (typeof raw.platform !== "string" || !platforms.includes(raw.platform)) errors.push(`${at}.platform must be one of the package's platforms: ${platforms.join(", ")}`);
    for (const key of ["width", "height"] as const) if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 1 || (raw[key] as number) > IMAGE_LIMITS.side) errors.push(`${at}.${key} must be a whole number of pixels from 1 to ${IMAGE_LIMITS.side}`);
    if (out.some((o) => o.digest === raw.digest)) errors.push(`${at}.digest is listed twice`);
    out.push({ digest: String(raw.digest), thumbnail: String(raw.thumbnail), caption: String(raw.caption), platform: String(raw.platform), width: Number(raw.width), height: Number(raw.height) });
  });
  return out;
}

export interface VulnerabilityWaiver {
  id: string;
  reason: string;
}

export function readWaivers(value: unknown, errors: string[]): VulnerabilityWaiver[] {
  if (!Array.isArray(value) || value.length > 50) {
    errors.push("vulnerabilityWaivers must be a list of at most 50 waivers");
    return [];
  }
  const out: VulnerabilityWaiver[] = [];
  value.forEach((w, i) => {
    const at = `vulnerabilityWaivers[${i}]`;
    if (!isRecord(w)) return void errors.push(`${at} must be an object`);
    unknownKeys(w, ["id", "reason"], at, errors);
    if (!isAdvisoryId(w.id)) errors.push(`${at}.id must be an advisory id (OSV, GHSA or CVE)`);
    else if (out.some((o) => o.id === w.id)) errors.push(`${at}.id ${w.id} is waived twice`);
    if (!text(w.reason, 500)) errors.push(`${at}.reason must be text of at most 500 characters`);
    out.push({ id: String(w.id), reason: String(w.reason) });
  });
  return out;
}

// Quality levels, each including the ones before it. Set by the publish tool from verified evidence.
export const QUALITY_LEVELS = ["packaged", "reviewed", "integration-tested", "live-tested"] as const;
export type QualityLevel = typeof QUALITY_LEVELS[number];

export interface Quality {
  level: QualityLevel;
  // true when the guardian signature is Level N's.
  certified: boolean;
  liveTested: { at: string; platform: string } | null;
}

export function validateQuality(value: unknown, where = "quality"): Result<"quality", Quality> {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: [`${where} must be an object with level, certified and liveTested`] };
  unknownKeys(value, ["level", "certified", "liveTested"], where, errors);
  if (!(QUALITY_LEVELS as readonly unknown[]).includes(value.level)) errors.push(`${where}.level must be one of ${QUALITY_LEVELS.join(", ")}`);
  if (typeof value.certified !== "boolean") errors.push(`${where}.certified must be true or false`);
  let liveTested: Quality["liveTested"] = null;
  if (value.liveTested !== undefined && value.liveTested !== null) {
    const l = value.liveTested;
    if (!isRecord(l) || typeof l.at !== "string" || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(l.at) || Number.isNaN(Date.parse(l.at)) || typeof l.platform !== "string" || !SLUG.test(l.platform)) errors.push(`${where}.liveTested must be { at: an ISO date, platform }`);
    else {
      unknownKeys(l, ["at", "platform"], `${where}.liveTested`, errors);
      liveTested = { at: l.at, platform: l.platform };
    }
  }
  if (value.level === "live-tested" && !liveTested) errors.push(`${where}: live-tested needs liveTested with the date and platform`);
  if (value.level !== "live-tested" && liveTested) errors.push(`${where}.liveTested is set only for live-tested`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, quality: { level: value.level as QualityLevel, certified: value.certified as boolean, liveTested } };
}

function readEntryFormat(value: unknown, errors: string[], expected: number = ENTRY_FORMAT, what = "entry"): void {
  if (value !== expected) errors.push(`format-refused: the ${what} format is ${expected}${typeof value === "number" && value < expected ? `; a format ${value} ${what} is refused, publish the version again with the current publish tool` : ""}`);
}

// ---------------------------------------------------------------- classes and categories

export interface CategoryNode {
  id: string;
  title: string;
  parent: string | null;
}

// classes/categories.json.
export function validateCategories(input: unknown): Result<"categories", CategoryNode[]> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["the body must be categories.json: { format, categories }"] };
  unknownKeys(input, ["format", "categories"], "body", errors);
  if (input.format !== 1) errors.push("format-refused: categories.json format is 1");
  const out: CategoryNode[] = [];
  if (!Array.isArray(input.categories) || input.categories.length === 0 || input.categories.length > 2000) errors.push("categories must be a list of 1 to 2000 categories");
  else
    input.categories.forEach((c, i) => {
      const at = `categories[${i}]`;
      if (!isRecord(c)) return void errors.push(`${at} must be an object`);
      unknownKeys(c, ["id", "title", "parent"], at, errors);
      if (typeof c.id !== "string" || c.id.length > 100 || !CATEGORY_PATH.test(c.id)) return void errors.push(`${at}.id must be a category path: lowercase segments joined by /`);
      const parent = c.id.includes("/") ? c.id.slice(0, c.id.lastIndexOf("/")) : null;
      if (c.parent !== parent) errors.push(`${at}.parent must be ${parent === null ? "null" : parent}`);
      if (!text(c.title, 60)) errors.push(`${at}.title must be text of at most 60 characters`);
      if (out.some((o) => o.id === c.id)) errors.push(`${at}.id ${c.id} is listed twice`);
      out.push({ id: c.id, title: String(c.title), parent });
    });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, categories: out };
}

export interface ClassEntry {
  format: 3;
  class: ClassDescriptor;
  digest: string;
}

// The publish body for a class: { format: 3, class: <class.json> }. The digest is computed, never sent.
export function validateClassEntry(input: unknown): Result<"entry", ClassEntry> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["the body must be a JSON object"] };
  unknownKeys(input, ["format", "class"], "body", errors);
  readEntryFormat(input.format, errors);
  const problems = validateDescriptor(input.class, Object.values(GRAMMAR_PATTERNS));
  const format = isRecord(input.class) ? input.class.format : undefined;
  errors.push(...problems.map((p) => (p === "class-format-refused" ? `class: class-format-refused: class.json format is ${CLASS_FORMAT}${typeof format === "number" && format < CLASS_FORMAT ? `; a format ${format} class.json is refused, write it again in format ${CLASS_FORMAT} with package URL names` : ""}` : `class: ${p}`)));
  if (problems.length === 0 && !isCatalogueName((input.class as Rec).name, "class")) errors.push(`class.name must be ${nameRule("class")}`);
  if (errors.length > 0) return { ok: false, errors };
  const c = input.class as ClassDescriptor;
  return { ok: true, entry: { format: ENTRY_FORMAT, class: c, digest: descriptorDigest(c) } };
}

// ---------------------------------------------------------------- recipe.json

// The instance id of the recipe's own application-specific component. No component may use it.
export const APPLICATION_INSTANCE = "application";

export const SCALE_KEYS = ["concurrentPeople", "requestsPerDay", "storedMegabytes"] as const;
export type ScaleKey = typeof SCALE_KEYS[number];

export type SetLiteral = string | number | boolean;

// The value a question effect gives a setting: a literal, "$answer", or one of the object forms.
export type SetValue = SetLiteral | { map: Record<string, SetLiteral> } | { fromScale: ScaleKey } | { template: string } | { ref: string };

// An interface a class provides or requires. Its port id is the last segment of the type.
export interface ClassInterface {
  type: string;
  version: string;
  // Only requirements carry it: the preferred component may leave this requirement unconnected.
  optional?: boolean;
}

// One entry of recipe.json `components`: a slot, filled by the preferred component or any other that fits the class.
export interface RecipeSlot {
  id: string;
  class: ClassReference;
  preferred: { name: string; version: string };
  configuration: Rec;
  includedWhen: Condition | null;
}

// A candidate names a component and one of its suitability profiles; `version` is required when the component is not
// the slot's preferred one (the preferred one is at the preferred version).
export interface RecipeJob {
  id: string;
  slot: string;
  candidates: { component: string; version?: string; profile: string; includedWhen?: Condition }[];
  overrideQuestion?: string;
}

// The port id of an interface type: its name (com.clodhub/card-deck -> card-deck).
export function portId(type: string): string {
  return type.slice(type.lastIndexOf("/") + 1);
}

// required: no default, always put to the person when its condition holds; unless-settled: has a default, asked when
// the request does not settle it; default: the default is taken unless the request says otherwise.
export const ASK = ["required", "unless-settled", "default"] as const;
export type Asking = typeof ASK[number];

export interface RecipeQuestion {
  id: string;
  question: string;
  ask: Asking;
  askAgent?: string;
  askWhen?: Condition;
  type: QuestionType;
  options?: (string | number)[];
  default?: Json;
  min?: number;
  max?: number;
  effects: { sets: Record<string, SetValue> }[];
}

export type SettingValues = Record<string, SetLiteral>;

export const SETTING_TYPES = ["string", "boolean", "integer"] as const;
export type SettingType = typeof SETTING_TYPES[number];

// A setting's type and grammar: one of GRAMMARS for a string, the type name for boolean and integer.
export interface SettingKind {
  id: string;
  type: SettingType;
  grammar: string;
  secret?: boolean;
}

// A setting a component collects (component.json `collect`), as its catalogue entry records it.
export interface SettingDeclaration extends SettingKind {
  required: boolean;
  secret: boolean;
  hasDefault: boolean;
  // The value clod writes when a recipe leaves the setting unset; present exactly when hasDefault is true.
  default?: SettingValue;
}

export type SettingValue = boolean | number | string;

// The interface-document keyword that declares entry modules by platform. Only this name is read.
export const INTERFACE_MODULES_KEYWORD = "x-clodhub-modules";

// The entry modules an interface document declares, platform to path; null when it declares none.
export function documentModules(document: unknown): Record<string, unknown> | null {
  if (!isRecord(document)) return null;
  const modules = document[INTERFACE_MODULES_KEYWORD];
  return isRecord(modules) ? modules : null;
}

// An entry module an interface document declares in "x-clodhub-modules": its path (null when the document gives no
// text), and whether the component installs it (clod's rule 4: the artefact destination components/<short name>/<path>,
// or for the native platforms apple and android a destination inside that folder).
export interface EntryModule {
  path: string | null;
  installed: boolean;
}

// What a component source (the catalogue, or a directory of components) records for one component version.
// `interfaceDigests` maps type@version of each provided interface to the sha256 of its document; `interfaceModules`
// maps it to the document's entry modules by platform.
export interface ComponentFacts {
  foundations: Foundations;
  name: string;
  version: string;
  provides: Port[];
  requires: Port[];
  settings: SettingDeclaration[];
  interfaceDigests: Record<string, string>;
  interfaceModules: Record<string, Record<string, EntryModule>>;
  profiles: { id: string; settings?: SettingValues }[];
}

// Component data the recipe check also verifies. Without `components` nothing about the components is checked; with it,
// every preferred component and job candidate must be found at its version. `find` may answer with another version of
// the name, which the check reports. `application` is the recipe's own component (its component.json).
export interface RecipeContext {
  authority?: Foundations;
  components?: { source: string; find: (name: string, version: string) => ComponentFacts | null };
  application?: { settings: SettingDeclaration[]; provides: Port[]; requires: Port[] };
}

// Anchored setting grammars from clod/application.py.
export const GRAMMAR_PATTERNS: Readonly<Record<string, string>> = {
  identifier: "^[A-Za-z][A-Za-z0-9_]{0,63}$",
  qualified: "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)+$",
  slug: "^[a-z][a-z0-9-]{0,63}$",
  label: "^[A-Za-z][A-Za-z0-9 -]{0,63}$",
  environment: "^[A-Z][A-Z0-9_]{0,63}$",
  address: "^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9_/-]*)?$",
};

export const GRAMMARS: Readonly<Record<string, RegExp>> = Object.fromEntries(Object.entries(GRAMMAR_PATTERNS).map(([grammar, pattern]) => [grammar, new RegExp(pattern)]));

const SECRET_REFERENCE = /^[A-Za-z][A-Za-z0-9_./-]{0,127}$/;
const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

export function matchesGrammar(grammar: string, value: string): boolean {
  const pattern = GRAMMARS[grammar];
  if (!pattern || !pattern.test(value)) return false;
  if (grammar !== "address") return true;
  try {
    const url = new URL(value);
    return url.hostname.split(".").every((part) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(part)) && (url.port === "" || (Number(url.port) >= 1 && Number(url.port) <= 65535));
  } catch {
    return false;
  }
}

// recipe.json format 3.
export const RECIPE_FORMAT = 3;

export interface Recipe {
  format: 3;
  name: string;
  version: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  targets: Targets;
  components: RecipeSlot[];
  jobs: RecipeJob[];
  scale: { question: string; bands: { id: string; label: string; load: Record<string, number> }[] } | null;
  questions: RecipeQuestion[];
  connections: { source: { instance: string; port: string }; target: { instance: string; port: string } }[];
  tests: { defaultAnswers: Rec; answerSets: { id: string; answers: Rec }[] };
  page: { description: string; diagram: string; screenshots: string[] };
  instructions: string;
}

const RECIPE_FIELDS = ["format", "name", "version", "title", "summary", "category", "tags", "targets", "components", "jobs", "scale", "questions", "connections", "tests", "page", "instructions"];

function isLiteral(value: unknown): value is SetLiteral {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

// A condition (CEL) checked against the questions, with its parsed expression and the questions it reads.
type ReadCondition = { condition: Condition; expr: ConditionExpr; questions: Set<string> };

// `label` names the question, component or job candidate the condition belongs to.
function readCondition(value: unknown, where: string, label: string, byId: ReadonlyMap<string, RecipeQuestion>, errors: string[]): ReadCondition | null {
  if (value === null || value === undefined) return null;
  const checked = checkCondition(value, byId);
  if (!checked.ok) {
    errors.push(`${where} (${label}): ${checked.error}`);
    return null;
  }
  return { condition: value as string, expr: checked.expr, questions: checked.questions };
}

// True only when no answers can satisfy both conditions: they confine one question to values that do not overlap.
function exclusive(a: ReadCondition | undefined, b: ReadCondition | undefined, byId: ReadonlyMap<string, RecipeQuestion>): boolean {
  if (!a || !b) return false;
  const left = confinements(a.expr, byId);
  const right = confinements(b.expr, byId);
  for (const [q, values] of left) {
    const other = right.get(q);
    if (other && [...values].every((v) => !other.has(v))) return true;
  }
  return false;
}

function checkAnswer(q: RecipeQuestion, value: unknown, where: string, errors: string[]): void {
  if (value === null || value === undefined) return;
  const inOptions = (v: unknown) => !q.options || q.options.includes(v as string | number);
  switch (q.type) {
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${where} must be true or false`);
      break;
    case "integer":
      if (!Number.isSafeInteger(value) || (q.min !== undefined && (value as number) < q.min) || (q.max !== undefined && (value as number) > q.max)) errors.push(`${where} must be an integer within the question's range`);
      break;
    case "choice":
      if (!inOptions(value)) errors.push(`${where} must be one of the options`);
      break;
    case "set":
      if (!Array.isArray(value) || !value.every(inOptions)) errors.push(`${where} must be a list drawn from the options`);
      break;
    case "text":
    case "account":
      if (typeof value !== "string" || value.length > 500) errors.push(`${where} must be text`);
      break;
    case "secretRef":
      if (typeof value !== "string" || !SECRET_REFERENCE.test(value)) errors.push(`${where} must be the name of a secret reference, never a secret value`);
      break;
  }
}

// ---------------------------------------------------------------- settings

// Why a literal cannot be the value of a setting, or null when it can. `schema` is the class property that declares the
// setting, whose other keywords (enum, minimum and the like) the value must also meet.
function literalProblem(value: unknown, s: SettingKind, schema?: Rec): string | null {
  if (!isLiteral(value)) return "is not a string, number or boolean";
  if (s.type === "boolean") {
    if (typeof value !== "boolean") return `is not a boolean, which setting ${s.id} takes`;
  } else if (s.type === "integer") {
    if (!(typeof value === "number" && Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX)) return `is not a 32-bit integer, which setting ${s.id} takes`;
  } else if (typeof value !== "string") return `is not text, which setting ${s.id} takes`;
  else if (GRAMMARS[s.grammar] && !matchesGrammar(s.grammar, value)) return `does not satisfy the ${s.grammar} grammar of setting ${s.id}`;
  const failed = schema ? valueProblem(schema, value) : null;
  return failed ? `fails the class configuration of setting ${s.id}: ${failed}` : null;
}

// ---------------------------------------------------------------- slots and classes

// The type and grammar a class property gives its setting, or null when it is none of the three forms
// {"type": "string", "pattern": <a GRAMMAR_PATTERNS value>}, {"type": "integer"} and {"type": "boolean"}.
export function propertyKind(schema: unknown): { type: SettingType; grammar: string } | null {
  if (!isRecord(schema)) return null;
  if (schema.type === "integer" || schema.type === "boolean") return { type: schema.type, grammar: schema.type };
  if (schema.type !== "string" || typeof schema.pattern !== "string") return null;
  const grammar = Object.keys(GRAMMAR_PATTERNS).find((g) => GRAMMAR_PATTERNS[g] === schema.pattern);
  return grammar ? { type: "string", grammar } : null;
}

// The class property that declares a setting of this type and grammar.
export function settingSchema(s: { type: SettingType; grammar: string }): Rec {
  return s.type === "string" ? { type: "string", pattern: GRAMMAR_PATTERNS[s.grammar] } : { type: s.type };
}

export function kindText(s: { type: SettingType; grammar: string }): string {
  return s.type === "string" ? `string (${s.grammar})` : s.type;
}

const GRAMMAR_WORDS: Readonly<Record<string, string>> = {
  identifier: "letters, digits and underscores",
  qualified: "a dotted name such as com.example.app",
  slug: "lowercase letters, digits and hyphens",
  label: "letters, digits, spaces and hyphens",
  environment: "capital letters, digits and underscores",
  address: "a web address",
};

// A setting's type for people: what kind of value it takes.
export function settingTypeWords(s: { type: SettingType; grammar: string }): string {
  if (s.type === "integer") return "whole number";
  if (s.type === "boolean") return "yes or no";
  return `text: ${GRAMMAR_WORDS[s.grammar] ?? s.grammar}`;
}

// The settings a class configuration declares, by id, with the property schema of each and whether it is always written.
export function classSettings(schema: Rec): { id: string; kind: { type: SettingType; grammar: string } | null; schema: Rec; required: boolean }[] {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(properties).map(([id, schema]) => ({ id, kind: propertyKind(schema), schema: isRecord(schema) ? schema : {}, required: required.includes(id) }));
}

// The key of an interface in `interfaceDigests` and `interfaceModules`: type@version.
export function interfaceKey(p: { type: string; version: string }): string {
  return `${p.type}@${p.version}`;
}

// Candidate ports, setting declarations and package foundations used by fit.
export type FitFacts = Pick<ComponentFacts, "name" | "foundations" | "provides" | "requires" | "settings">;

// clod.recipe.fit on publisher-declared facts and independent class authority.
export function fit(reference: ClassReference, c: FitFacts, authority: Foundations | null, targets?: string[]): string[] {
  if (!isClassReference(reference)) return ["invalid-class-reference"];
  if (authority === null) return [`class-unavailable:${reference.name}`];
  const declaration = classDescriptor(reference, authority);
  const classFailure = (f: Foundations) => `${f.classes.some(c => canonical(c.reference) === canonical(reference)) ? "class-digest" : "class-unavailable"}:${reference.name}`;
  if (!declaration) return [classFailure(authority)];
  if (!classDescriptor(reference, c.foundations)) return [classFailure(c.foundations)];
  const cls = { provides: declaration.provides, requires: declaration.requires, configuration: declaration.settings };
  const reasons: string[] = [];
  reasons.push(...graphProblems([{ name: "authority", foundations: authority }, { name: c.name, foundations: c.foundations }]));
  if (!c.foundations.implements.some(r => canonical(r) === canonical(reference))) reasons.push(`class-implementation:${reference.name}`);
  for (const p of cls.provides) {
    const key = interfaceKey(p);
    if (!c.provides.some((x) => interfaceKey(x) === key)) {
      reasons.push(`provides:${key}`);
    }
  }
  for (const r of c.requires) if (!r.optional && !cls.requires.some((x) => interfaceKey(x) === interfaceKey(r))) reasons.push(`requires:${interfaceKey(r)}`);
  const properties = isRecord(cls.configuration.properties) ? cls.configuration.properties : {};
  for (const [id, wanted] of Object.entries(properties)) {
    const s = c.settings.find((x) => x.id === id);
    if (!s) reasons.push(`setting:${id}`);
    else if (!isRecord(wanted) || Object.entries(settingSchema(s)).some(([k, v]) => (wanted as Rec)[k] !== v)) reasons.push(`setting-type:${id}`);
  }
  const required = Array.isArray(cls.configuration.required) ? cls.configuration.required : [];
  for (const s of c.settings) if (s.required && !s.hasDefault && !required.includes(s.id)) reasons.push(`unset-setting:${s.id}`);
  const supported = [...new Set(declaration.provides.flatMap(p => Object.keys(p.modules)))].sort();
  const short = `components/${slugOf(c.name)}/`;
  for (const platform of supported.filter(p => !targets || targets.includes(p))) {
    if (!c.foundations.platforms.includes(platform)) reasons.push(`platform:${platform}`);
    for (const p of declaration.provides) for (const path of p.modules[platform] ?? [])
      if (!c.foundations.artefacts.some(a => a.destination === short + path || a.destination.startsWith(short + path.replace(/\/$/, "") + "/"))) reasons.push(`module:${platform}:${path}`);
  }
  return reasons;
}

const TEMPLATE_TOKEN = /\{\{([^{}]*)\}\}/g;

// `decl` is the setting the target names, with `schema` its class property when the target is a slot.
function checkSetValue(value: unknown, q: RecipeQuestion, at: string, decl: SettingKind | undefined, schema: Rec | undefined, byId: ReadonlyMap<string, RecipeQuestion>, hasScale: boolean, errors: string[]): void {
  const fail = (message: string): void => void errors.push(`${at} ${message}`);
  const literal = (v: unknown, label: string) => {
    if (!isLiteral(v) || (typeof v === "string" && v.startsWith("$"))) return fail(`${label} must be a string, number or boolean literal not starting with $`);
    if (!decl) return;
    if (decl.secret) return fail(`${label} is a literal, but setting ${decl.id} is secret; use {"ref": <secretRef question>}`);
    const problem = literalProblem(v, decl, schema);
    if (problem) fail(`${label} ${problem}`);
  };
  const answerFits = (what: string) => {
    if (!decl) return;
    if (decl.secret) return fail(`${what} gives a value, but setting ${decl.id} is secret; use {"ref": <secretRef question>}`);
    switch (q.type) {
      case "set": {
        if (decl.type !== "string") return fail(`${what} is a space-separated string, but setting ${decl.id} is ${decl.type}`);
        const joined = (q.options ?? []).join(" ");
        if (GRAMMARS[decl.grammar] && !matchesGrammar(decl.grammar, joined)) fail(`${what} joins ${q.id} options with spaces, which the ${decl.grammar} grammar of setting ${decl.id} refuses`);
        return;
      }
      case "choice":
        for (const o of q.options ?? []) {
          const problem = literalProblem(o, decl, schema);
          if (problem) return fail(`${what}: option ${o} ${problem}`);
        }
        return;
      case "boolean":
        if (decl.type !== "boolean") fail(`${what} is a boolean, but setting ${decl.id} is ${decl.type}`);
        return;
      case "integer":
        if (decl.type !== "integer") fail(`${what} is an integer, but setting ${decl.id} is ${decl.type}`);
        else if ((q.min !== undefined && q.min < INT32_MIN) || (q.max !== undefined && q.max > INT32_MAX)) fail(`${what} may exceed 32 bits, which setting ${decl.id} takes`);
        return;
      default:
        if (decl.type !== "string") fail(`${what} is text, but setting ${decl.id} is ${decl.type}`);
    }
  };

  if (isLiteral(value) && !(typeof value === "string" && value.startsWith("$"))) return literal(value, "value");
  if (typeof value === "string") {
    if (value !== "$answer") return fail(`value ${value.slice(0, 40)} is not a known form; use a literal, "$answer", or an object with map, fromScale, template or ref`);
    if (q.type === "secretRef") return fail(`value "$answer" on the secretRef question ${q.id} must be {"ref": "${q.id}"}`);
    return answerFits('"$answer"');
  }
  if (!isRecord(value)) return fail("value must be a literal, \"$answer\", or an object with map, fromScale, template or ref");
  const keys = Object.keys(value);
  const form = keys.length === 1 ? keys[0] : null;
  switch (form) {
    case "map": {
      const map = value.map;
      if (q.type !== "choice") return fail(`map applies to choice questions; ${q.id} is ${q.type}`);
      if (!isRecord(map)) return fail("map must be an object from each option to a literal");
      const options = (q.options ?? []).map(String);
      for (const key of Object.keys(map)) if (!options.includes(key)) fail(`map names ${key.slice(0, 40)}, which is not an option of ${q.id}`);
      for (const option of options) {
        if (!(option in map)) fail(`map has no value for option ${option}`);
        else literal(map[option], `map[${option}]`);
      }
      return;
    }
    case "fromScale":
      if (typeof value.fromScale !== "string" || !(SCALE_KEYS as readonly string[]).includes(value.fromScale)) return fail(`fromScale must be one of ${SCALE_KEYS.join(", ")}`);
      if (!hasScale) fail("fromScale needs the recipe to have a scale");
      if (decl && decl.type !== "integer") fail(`fromScale gives a number, but setting ${decl.id} is ${decl.type}`);
      return;
    case "template": {
      const template = value.template;
      if (typeof template !== "string" || template.length === 0 || template.length > 200) return fail("template must be text of at most 200 characters");
      const tokens = [...template.matchAll(TEMPLATE_TOKEN)].map((m) => m[1]);
      if (tokens.length === 0 || tokens.some((t) => t !== "answer") || template.replace(TEMPLATE_TOKEN, "").match(/[{}]/)) return fail("template must contain {{answer}} and no other braces");
      if (q.type === "set" || q.type === "secretRef") return fail(`template applies to single-answer questions; ${q.id} is ${q.type}`);
      if (decl) {
        if (decl.secret) return fail(`template gives a value, but setting ${decl.id} is secret; use {"ref": <secretRef question>}`);
        if (decl.type !== "string") return fail(`template gives text, but setting ${decl.id} is ${decl.type}`);
        if (q.type === "choice") for (const o of q.options ?? []) if (GRAMMARS[decl.grammar] && !matchesGrammar(decl.grammar, template.replace(TEMPLATE_TOKEN, String(o)))) return fail(`template with option ${o} does not satisfy the ${decl.grammar} grammar of setting ${decl.id}`);
      }
      return;
    }
    case "ref": {
      const target = typeof value.ref === "string" ? byId.get(value.ref) : undefined;
      if (!target || target.type !== "secretRef") return fail("ref must name a secretRef question of the recipe");
      if (decl && decl.type !== "string") fail(`ref gives a reference name, but setting ${decl.id} is ${decl.type}`);
      return;
    }
    default:
      return fail("value must be an object with exactly one of map, fromScale, template or ref");
  }
}

// "<instance>.<setting>": the longest instance id that prefixes the target.
function resolveTarget(target: string, instances: Iterable<string>): { instance: string; setting: string } | null {
  let best: { instance: string; setting: string } | null = null;
  for (const id of instances) {
    if (!target.startsWith(`${id}.`) || target.length <= id.length + 1) continue;
    if (!best || id.length > best.instance.length) best = { instance: id, setting: target.slice(id.length + 1) };
  }
  return best && IDENTIFIER.test(best.setting) ? best : null;
}

function readQuestion(raw: unknown, index: number, errors: string[]): { question: RecipeQuestion; askWhen: unknown } | null {
  const where = `questions[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${where} must be an object`);
    return null;
  }
  unknownKeys(raw, ["id", "question", "ask", "askAgent", "askWhen", "type", "options", "default", "min", "max", "effects"], where, errors);
  const asking = (ASK as readonly unknown[]).includes(raw.ask) ? (raw.ask as Asking) : null;
  if (!asking) errors.push(`${where}.ask must be one of ${ASK.join(", ")}`);
  if (typeof raw.id !== "string" || !IDENTIFIER.test(raw.id)) errors.push(`${where}.id must be an identifier`);
  if (!text(raw.question, 300)) errors.push(`${where}.question must be text of at most 300 characters`);
  if (raw.askAgent !== undefined && !text(raw.askAgent, 300)) errors.push(`${where}.askAgent must be text of at most 300 characters`);
  const type = (QUESTION_TYPES as readonly unknown[]).includes(raw.type) ? (raw.type as QuestionType) : null;
  if (!type) {
    errors.push(`${where}.type must be one of ${QUESTION_TYPES.join(", ")}`);
    return null;
  }
  const q: RecipeQuestion = { id: String(raw.id), question: String(raw.question), ask: asking ?? "default", type, effects: [] };
  if (raw.askAgent !== undefined && typeof raw.askAgent === "string") q.askAgent = raw.askAgent;
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options) || raw.options.length > 100 || !raw.options.every((o) => (typeof o === "string" && o.length <= 100) || (typeof o === "number" && Number.isFinite(o)))) errors.push(`${where}.options must be a list of at most 100 strings or numbers`);
    else q.options = raw.options as (string | number)[];
  }
  if ((type === "set" || type === "choice") && (!q.options || q.options.length === 0)) errors.push(`${where}: a ${type} question needs options`);
  if (type !== "set" && type !== "choice" && q.options !== undefined) errors.push(`${where}: only set and choice questions have options`);
  for (const key of ["min", "max"] as const) {
    if (raw[key] === undefined) continue;
    if (type !== "integer" || !Number.isSafeInteger(raw[key])) errors.push(`${where}.${key} applies to integer questions and must be an integer`);
    else q[key] = raw[key] as number;
  }
  if (q.min !== undefined && q.max !== undefined && q.min > q.max) errors.push(`${where}.min is above max`);
  if (raw.default !== undefined) {
    if (type === "secretRef" && raw.default !== null) errors.push(`${where}: a secretRef question never has a default`);
    else if (type !== "secretRef") checkAnswer(q, raw.default, `${where}.default`, errors);
    q.default = raw.default;
  }
  const hasDefault = raw.default !== undefined && raw.default !== null;
  if (asking === "required" && hasDefault) errors.push(`${where}: a required question has no default`);
  if (asking && asking !== "required" && !hasDefault) errors.push(`${where}: a question with ask ${asking} needs a default`);
  if (raw.effects !== undefined) {
    if (!Array.isArray(raw.effects) || raw.effects.length > 20) errors.push(`${where}.effects must be a list of at most 20 effects`);
    else {
      raw.effects.forEach((effect, i) => {
        const at = `${where}.effects[${i}]`;
        if (!isRecord(effect)) return void errors.push(`${at} must be an object`);
        unknownKeys(effect, ["sets"], at, errors);
        if (effect.sets === undefined) return void errors.push(`${at} needs sets`);
        if (!isRecord(effect.sets) || Object.keys(effect.sets).length === 0 || Object.keys(effect.sets).some((k) => !text(k, 120))) return void errors.push(`${at}.sets must map "<componentId>.<settingId>" to values`);
        q.effects.push({ sets: effect.sets as Record<string, SetValue> });
      });
    }
  }
  return { question: q, askWhen: raw.askWhen };
}

// True when the condition of `from`, followed through the askWhen of the questions it names, reaches `target`.
function reaches(from: string, target: string, askWhen: ReadonlyMap<string, ReadCondition>, seen: Set<string>): boolean {
  for (const id of askWhen.get(from)?.questions ?? []) {
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    if (reaches(id, target, askWhen, seen)) return true;
  }
  return false;
}

// Rule 5: two questions may not set one target to different values unless their askWhen conditions cannot both hold.
function checkConflicts(questions: RecipeQuestion[], askWhen: ReadonlyMap<string, ReadCondition>, byId: ReadonlyMap<string, RecipeQuestion>, errors: string[]): void {
  const seen = new Map<string, { q: RecipeQuestion; value: SetValue }[]>();
  const answerDependent = (v: SetValue) => typeof v === "object" ? !("fromScale" in v) : v === "$answer";
  for (const q of questions)
    for (const effect of q.effects)
      for (const [target, value] of Object.entries(effect.sets)) {
        for (const prior of seen.get(target) ?? []) {
          const same = prior.q.id === q.id ? JSON.stringify(prior.value) === JSON.stringify(value) : !answerDependent(value) && !answerDependent(prior.value) && JSON.stringify(prior.value) === JSON.stringify(value);
          if (same) continue;
          if (prior.q.id !== q.id && exclusive(askWhen.get(prior.q.id), askWhen.get(q.id), byId)) continue;
          errors.push(`questions ${prior.q.id} and ${q.id} both set ${target.slice(0, 60)} to different values and are not mutually exclusive by askWhen`);
        }
        seen.set(target, [...(seen.get(target) ?? []), { q, value }]);
      }
}

// `context` carries component data when the caller has it (settings from component.json, profiles from suitability.json); what it lacks is accepted unchecked.
export function validateRecipe(input: unknown, context: RecipeContext = {}): Result<"recipe", Recipe> {
  const errors: string[] = [];
  if (!context.authority) errors.push("recipe authority foundations are required");
  else {
    const invalid = validateFoundations(context.authority, "recipe", Object.values(GRAMMAR_PATTERNS));
    if (invalid.length) return { ok: false, errors: invalid };
  }
  if (!isRecord(input)) return { ok: false, errors: ["recipe.json must be a JSON object"] };
  if (JSON.stringify(input).length > LIMITS.recipeJson) return { ok: false, errors: [`recipe.json is larger than ${LIMITS.recipeJson} characters`] };
  unknownKeys(input, RECIPE_FIELDS, "recipe", errors);
  if (input.format !== RECIPE_FORMAT) errors.push(`format-refused: recipe.json format is ${RECIPE_FORMAT}${typeof input.format === "number" && input.format < RECIPE_FORMAT ? `; a format ${input.format} recipe.json is refused, write it again in format ${RECIPE_FORMAT} with package URL names` : ""}`);
  if (!isCatalogueName(input.name, "recipe")) errors.push(`name must be ${nameRule("recipe")}`);
  if (!isPackageVersion(input.version)) errors.push("version must be three integers, for example 0.2.0");
  if (!text(input.title, LIMITS.title)) errors.push(`title must be text of at most ${LIMITS.title} characters`);
  if (!text(input.summary, LIMITS.summary)) errors.push(`summary must be text of at most ${LIMITS.summary} characters`);
  if (typeof input.category !== "string" || !CATEGORY_PATH.test(input.category) || input.category.length > 100) errors.push("category must be a category path such as games or games/cards");
  const tags = readTags(input.tags, "tags", errors);
  const targets = readTargets(input.targets, "targets", errors);
  if (context.authority) for (const target of [...targets.client, ...(targets.server.length ? ["server"] : [])]) if (!context.authority.platforms.includes(target)) errors.push(`targets: unsupported-platform:${target}`);

  const questions: RecipeQuestion[] = [];
  const askWhens: unknown[] = [];
  if (!Array.isArray(input.questions) || input.questions.length > LIMITS.questions) errors.push(`questions must be a list of at most ${LIMITS.questions} questions`);
  else
    input.questions.forEach((q, i) => {
      const read = readQuestion(q, i, errors);
      if (!read) return;
      if (questions.some((other) => other.id === read.question.id)) errors.push(`questions[${i}].id ${read.question.id} is used twice`);
      questions.push(read.question);
      askWhens.push(read.askWhen);
    });
  const byId: ReadonlyMap<string, RecipeQuestion> = new Map(questions.map((q) => [q.id, q]));
  const askWhen = new Map<string, ReadCondition>();
  questions.forEach((q, i) => {
    const condition = readCondition(askWhens[i], `questions[${i}].askWhen`, `question ${q.id}`, byId, errors);
    if (!condition) return;
    q.askWhen = condition.condition;
    askWhen.set(q.id, condition);
  });
  questions.forEach((q, i) => {
    if (askWhen.has(q.id) && reaches(q.id, q.id, askWhen, new Set())) errors.push(`questions[${i}].askWhen leads back to ${q.id}: questions may not wait on each other in a circle`);
  });

  const slots: RecipeSlot[] = [];
  // The settings each slot's class declares.
  const declared = new Map<string, Map<string, SettingKind & { schema: Rec }>>();
  if (!Array.isArray(input.components) || input.components.length === 0 || input.components.length > LIMITS.components) errors.push(`components must be a list of 1 to ${LIMITS.components} slots`);
  else
    input.components.forEach((c, i) => {
      const where = `components[${i}]`;
      if (!isRecord(c)) return void errors.push(`${where} must be a slot: an object with id, class, preferred, configuration and includedWhen`);
      unknownKeys(c, ["id", "class", "preferred", "configuration", "includedWhen"], where, errors);
      if (typeof c.id !== "string" || !IDENTIFIER.test(c.id)) errors.push(`${where}.id must be an identifier`);
      else if (c.id === APPLICATION_INSTANCE) errors.push(`${where}.id ${APPLICATION_INSTANCE} is reserved for the recipe's own component`);
      else if (slots.some((other) => other.id === c.id)) errors.push(`${where}.id ${c.id} is used twice`);
      const cls: { provides: ClassInterface[]; requires: ClassInterface[]; configuration: Rec } = { provides: [], requires: [], configuration: {} };
      let kinds = new Map<string, SettingKind & { schema: Rec }>();
      if (!isClassReference(c.class)) errors.push(`${where}.class must be exactly {name, version, digest}`);
      else {
        const descriptor = context.authority ? classDescriptor(c.class, context.authority) : null;
        if (!descriptor) errors.push(`${where}.class: class-unavailable:${c.class.name}`);
        cls.provides = descriptor?.provides ?? [];
        cls.requires = descriptor?.requires ?? [];
        for (const p of cls.provides) if (cls.requires.some((r) => portId(r.type) === portId(p.type))) errors.push(`${where}.class: port id ${portId(p.type)} is both provided and required`);
        if (descriptor) {
          cls.configuration = descriptor.settings;
          kinds = new Map(classSettings(descriptor.settings).flatMap(s => s.kind ? [[s.id, { id: s.id, ...s.kind, schema: s.schema }]] : []));
        }
      }
      const preferred = { name: "", version: "" };
      if (!isRecord(c.preferred)) errors.push(`${where}.preferred must be an object with name and version`);
      else {
        unknownKeys(c.preferred, ["name", "version"], `${where}.preferred`, errors);
        if (!isCatalogueName(c.preferred.name, "component")) errors.push(`${where}.preferred.name must be ${nameRule("component")}`);
        else if (slugOf(c.preferred.name) === APPLICATION_INSTANCE) errors.push(`${where}.preferred.name ${c.preferred.name} is not allowed: no component is named ${APPLICATION_INSTANCE}`);
        else preferred.name = c.preferred.name;
        if (!isPackageVersion(c.preferred.version)) errors.push(`${where}.preferred.version must be three integers`);
        else preferred.version = c.preferred.version;
      }
      if (c.configuration !== undefined && !isRecord(c.configuration)) errors.push(`${where}.configuration must be an object`);
      else if (isRecord(c.configuration) && isRecord(c.class)) {
        for (const [setting, v] of Object.entries(c.configuration)) {
          const kind = kinds.get(setting);
          if (!kind) errors.push(`${where}.configuration.${setting.slice(0, 40)} is not declared in the slot's class configuration`);
          else {
            const problem = literalProblem(v, kind, kind.schema);
            if (problem) errors.push(`${where}.configuration.${setting} ${problem}`);
          }
        }
      }
      if (typeof c.id === "string") declared.set(c.id, kinds);
      slots.push({
        id: String(c.id),
        class: c.class as ClassReference,
        preferred,
        configuration: isRecord(c.configuration) ? c.configuration : {},
        includedWhen: readCondition(c.includedWhen, `${where}.includedWhen`, `slot ${String(c.id).slice(0, 64)}`, byId, errors)?.condition ?? null,
      });
    });
  const slotById = new Map(slots.map((s) => [s.id, s]));

  // With component data at hand: what each preferred component is, and whether it fits its slot's class.
  const components = context.components;
  const preferredFacts = new Map<string, ComponentFacts>();
  const lookup = (name: string, version: string, at: string): ComponentFacts | null => {
    const facts = components!.find(name, version);
    if (!facts) errors.push(`${at} ${name} ${version} is not in ${components!.source}`);
    else if (facts.version !== version) errors.push(`${at} ${name} ${version} is not in ${components!.source}, which has version ${facts.version}`);
    return facts && facts.version === version ? facts : null;
  };
  // Every candidate is checked against the recipe's class declaration.
  const factsProblem = (facts: ComponentFacts, slot: RecipeSlot): string | null => {
    const targets = context.authority ? facts.foundations.platforms.filter(p => context.authority!.platforms.includes(p)) : [];
    const reasons = context.authority ? [...(targets.length ? [] : [`unsupported-platform:${facts.name}`]), ...fit(slot.class, facts, context.authority, targets)] : [`class-unavailable:${slot.class.name}`];
    return reasons.length === 0 ? null : `${facts.name} ${facts.version} does not fit the class of slot ${slot.id}: ${reasons.join(", ")}`;
  };
  if (components)
    slots.forEach((slot, i) => {
      const { name, version } = slot.preferred;
      if (name === "" || version === "") return;
      const at = `components[${i}].preferred`;
      const facts = lookup(name, version, at);
      if (!facts) return;
      preferredFacts.set(slot.id, facts);
      const problem = factsProblem(facts, slot);
      if (problem) errors.push(`${at}: ${problem}`);
      for (const setting of Object.keys(slot.configuration)) {
        if (facts.settings.find((s) => s.id === setting)?.secret) errors.push(`components[${i}].configuration.${setting} is secret: it takes its reference from a question through {"ref": <secretRef question>}, not from configuration`);
      }
    });

  const jobs: RecipeJob[] = [];
  if (input.jobs !== undefined) {
    if (!Array.isArray(input.jobs) || input.jobs.length > 30) errors.push("jobs must be a list of at most 30 jobs");
    else
      input.jobs.forEach((j, i) => {
        const where = `jobs[${i}]`;
        if (!isRecord(j)) return void errors.push(`${where} must be an object`);
        unknownKeys(j, ["id", "slot", "candidates", "overrideQuestion"], where, errors);
        if (typeof j.id !== "string" || !IDENTIFIER.test(j.id)) errors.push(`${where}.id must be an identifier`);
        else if (jobs.some((other) => other.id === j.id)) errors.push(`${where}.id ${j.id} is used twice`);
        const slot = typeof j.slot === "string" ? slotById.get(j.slot) : undefined;
        if (!slot) errors.push(`${where}.slot must name one of the recipe's slots`);
        else if (jobs.some((other) => other.slot === slot.id)) errors.push(`${where}.slot ${slot.id} already has a job`);
        let overrideQuestion: string | undefined;
        if (j.overrideQuestion !== undefined) {
          const target = typeof j.overrideQuestion === "string" ? byId.get(j.overrideQuestion) : undefined;
          if (!target) errors.push(`${where}.overrideQuestion must name one of the recipe's questions`);
          else if (target.type !== "choice" && target.type !== "text") errors.push(`${where}.overrideQuestion must name a choice or text question, whose answer names a profile or provider`);
          else overrideQuestion = target.id;
        }
        const candidates: RecipeJob["candidates"] = [];
        if (!Array.isArray(j.candidates) || j.candidates.length === 0 || j.candidates.length > 20) errors.push(`${where}.candidates must be a list of 1 to 20 candidates`);
        else
          j.candidates.forEach((c, n) => {
            if (!isRecord(c) || !isCatalogueName(c.component, "component") || typeof c.profile !== "string" || !IDENTIFIER.test(c.profile)) return void errors.push(`${where}.candidates[${n}] needs a component package name and a profile id`);
            const at = `${where}.candidates[${n}]`;
            unknownKeys(c, ["component", "version", "profile", "includedWhen"], at, errors);
            let version: string | undefined;
            if (c.version !== undefined && !isPackageVersion(c.version)) errors.push(`${at}.version must be three integers`);
            else if (typeof c.version === "string") version = c.version;
            const preferred = slot !== undefined && c.component === slot.preferred.name && (version === undefined || version === slot.preferred.version);
            if (slot && !preferred && version === undefined) errors.push(`${at}.version is required: ${c.component} is not the preferred component of slot ${slot.id}`);
            if (components && slot && (preferred || version !== undefined)) {
              // The preferred component fits by the check above; any other candidate must fit the slot's class too.
              const facts = preferred ? preferredFacts.get(slot.id) : lookup(c.component, version!, `${at}.component`);
              const problem = !preferred && facts ? factsProblem(facts, slot) : null;
              if (problem) errors.push(`${at}: ${problem}`);
              const profile = facts?.profiles.find((p) => p.id === c.profile);
              if (facts && !profile) errors.push(`${at}.profile ${c.profile} is not a profile of ${c.component}`);
              for (const [setting, v] of Object.entries(profile?.settings ?? {})) {
                const decl = facts?.settings.find((d) => d.id === setting);
                if (facts && !decl) errors.push(`${at}.profile ${c.profile} sets ${setting.slice(0, 40)}, which is not a setting of ${c.component}`);
                else if (decl) {
                  const problem = literalProblem(v, decl);
                  if (problem) errors.push(`${at}.profile ${c.profile} setting ${setting} ${problem}`);
                }
              }
            }
            const includedWhen = readCondition(c.includedWhen, `${at}.includedWhen`, `job ${String(j.id).slice(0, 64)}, ${c.component} ${c.profile}`, byId, errors)?.condition;
            candidates.push({ component: c.component, ...(version ? { version } : {}), profile: c.profile, ...(includedWhen ? { includedWhen } : {}) });
          });
        jobs.push({ id: String(j.id), slot: String(j.slot), candidates, ...(overrideQuestion ? { overrideQuestion } : {}) });
      });
  }

  let scale: Recipe["scale"] = null;
  if (input.scale !== undefined && input.scale !== null) {
    const s = input.scale;
    if (!isRecord(s)) errors.push("scale must be an object");
    else {
      unknownKeys(s, ["question", "bands"], "scale", errors);
      const scaleQuestion = typeof s.question === "string" ? byId.get(s.question) : undefined;
      if (!scaleQuestion) errors.push("scale.question must name one of the recipe's questions");
      else if (scaleQuestion.type !== "choice") errors.push("scale.question must name a choice question whose options are the band ids");
      const bands: NonNullable<Recipe["scale"]>["bands"] = [];
      if (!Array.isArray(s.bands) || s.bands.length === 0 || s.bands.length > 10) errors.push("scale.bands must be a list of 1 to 10 bands");
      else
        s.bands.forEach((b, i) => {
          const where = `scale.bands[${i}]`;
          if (!isRecord(b) || typeof b.id !== "string" || !IDENTIFIER.test(b.id) || !text(b.label, 200)) return void errors.push(`${where} needs an id and a label`);
          unknownKeys(b, ["id", "label", "load"], where, errors);
          const load = readLoad(b.load, `${where}.load`, errors);
          bands.push({ id: b.id, label: String(b.label), load });
        });
      if (scaleQuestion?.type === "choice") for (const option of scaleQuestion.options ?? []) if (!bands.some((b) => b.id === option)) errors.push(`scale.question option ${option} is not a band id`);
      scale = { question: String(s.question), bands };
    }
  }

  const connections: Recipe["connections"] = [];
  if (!Array.isArray(input.connections) || input.connections.length > LIMITS.connections) errors.push(`connections must be a list of at most ${LIMITS.connections} connections`);
  else
    input.connections.forEach((c, i) => {
      const where = `connections[${i}]`;
      if (!isRecord(c)) return void errors.push(`${where} must be an object`);
      unknownKeys(c, ["source", "target"], where, errors);
      // A connection runs from a port its source provides to a port its target requires, both of one interface type.
      const ends = (["source", "target"] as const).map((side) => {
        const end = c[side];
        if (!isRecord(end) || typeof end.instance !== "string" || typeof end.port !== "string" || !IDENTIFIER.test(end.port)) {
          errors.push(`${where}.${side} needs an instance and a port`);
          return { end: { instance: "", port: "" }, port: undefined };
        }
        const at = `${where}.${side}`;
        const direction = side === "source" ? "provides" : "requires";
        let port: ClassInterface | undefined;
        if (end.instance === APPLICATION_INSTANCE) {
          const own = context.application?.[direction];
          port = own?.find((p) => p.id === end.port);
          if (own && !port) errors.push(`${at}.port ${end.port.slice(0, 64)} is not a port the recipe's own component ${direction}`);
        } else {
          const slot = slotById.get(end.instance);
          if (!slot) errors.push(`${at}.instance ${end.instance.slice(0, 40)} is not a slot id or ${APPLICATION_INSTANCE}`);
          else {
            const ports = context.authority ? classDescriptor(slot.class, context.authority)?.[direction] ?? [] : [];
            port = ports.find((p) => portId(p.type) === end.port);
            if (!port) errors.push(`${at}.port ${end.port.slice(0, 64)} is not a port the class of slot ${slot.id} ${direction} (${ports.map((p) => portId(p.type)).join(", ") || "none"})`);
          }
        }
        return { end: { instance: end.instance, port: end.port }, port };
      });
      const [from, to] = ends as [(typeof ends)[number], (typeof ends)[number]];
      if (from.port && to.port && (from.port.type !== to.port.type || from.port.version !== to.port.version)) errors.push(`${where} joins ${from.port.type} ${from.port.version} to ${to.port.type} ${to.port.version}; both ends must be one interface type and version`);
      connections.push({ source: from.end, target: to.end });
    });

  questions.forEach((q, i) =>
    q.effects.forEach((effect, n) => {
      for (const [target, value] of Object.entries(effect.sets)) {
        const at = `questions[${i}].effects[${n}].sets[${target.slice(0, 60)}]`;
        const resolved = resolveTarget(target, [APPLICATION_INSTANCE, ...slotById.keys()]);
        if (!resolved) {
          errors.push(`${at}: the target must be <slotId>.<settingId> of a slot of the recipe, or ${APPLICATION_INSTANCE}.<settingId>`);
          continue;
        }
        if (resolved.instance === APPLICATION_INSTANCE) {
          const own = context.application?.settings;
          const decl = own?.find((d) => d.id === resolved.setting);
          if (own && !decl) errors.push(`${at}: ${resolved.setting} is not a setting of ${APPLICATION_INSTANCE}`);
          checkSetValue(value, q, at, decl, undefined, byId, scale !== null, errors);
          continue;
        }
        const kind = declared.get(resolved.instance)?.get(resolved.setting);
        if (!kind) {
          errors.push(`${at}: ${resolved.setting} is not declared in the class configuration of slot ${resolved.instance}`);
          checkSetValue(value, q, at, undefined, undefined, byId, scale !== null, errors);
          continue;
        }
        const secret = preferredFacts.get(resolved.instance)?.settings.find((s) => s.id === resolved.setting)?.secret === true;
        checkSetValue(value, q, at, { ...kind, secret }, kind.schema, byId, scale !== null, errors);
      }
    }),
  );
  checkConflicts(questions, askWhen, byId, errors);

  const tests: Recipe["tests"] = { defaultAnswers: {}, answerSets: [] };
  if (!isRecord(input.tests)) errors.push("tests must be an object with defaultAnswers and answerSets");
  else {
    unknownKeys(input.tests, ["defaultAnswers", "answerSets"], "tests", errors);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const checkAnswers = (answers: unknown, where: string): Rec => {
      if (!isRecord(answers)) {
        errors.push(`${where} must be an object of answers`);
        return {};
      }
      for (const [id, value] of Object.entries(answers)) {
        const q = byId.get(id);
        if (!q) errors.push(`${where} answers ${id.slice(0, 40)}, which is not a question`);
        else checkAnswer(q, value, `${where}.${id}`, errors);
      }
      if (context.authority) try { selectedTargets(context.authority, answers); } catch (error) { errors.push(`${where}: ${(error as Error).message}`); }
      return answers;
    };
    tests.defaultAnswers = checkAnswers(input.tests.defaultAnswers, "tests.defaultAnswers");
    if (!Array.isArray(input.tests.answerSets) || input.tests.answerSets.length > LIMITS.answerSets) errors.push(`tests.answerSets must be a list of at most ${LIMITS.answerSets} answer sets`);
    else
      input.tests.answerSets.forEach((set, i) => {
        const where = `tests.answerSets[${i}]`;
        if (!isRecord(set) || typeof set.id !== "string" || !IDENTIFIER.test(set.id)) return void errors.push(`${where} needs an id`);
        unknownKeys(set, ["id", "answers"], where, errors);
        if (tests.answerSets.some((other) => other.id === set.id)) errors.push(`${where}.id ${set.id} is used twice`);
        tests.answerSets.push({ id: set.id, answers: checkAnswers(set.answers, `${where}.answers`) });
      });
  }

  const page: Recipe["page"] = { description: "", diagram: "", screenshots: [] };
  if (!isRecord(input.page)) errors.push("page must be an object with description, diagram and screenshots");
  else {
    unknownKeys(input.page, ["description", "diagram", "screenshots"], "page", errors);
    if (!isPackagePath(input.page.description)) errors.push("page.description must be a relative path inside the package");
    else page.description = input.page.description;
    if (!isPackagePath(input.page.diagram)) errors.push("page.diagram must be a relative path inside the package");
    else page.diagram = input.page.diagram;
    page.screenshots = stringList(input.page.screenshots ?? [], "page.screenshots", errors, { max: LIMITS.screenshots, item: isPackagePath, what: "relative paths" });
  }
  if (!isPackagePath(input.instructions)) errors.push("instructions must be a relative path inside the package");

  if (context.authority && components) {
    const guaranteedSlots = slots.filter(s => s.includedWhen === null && !jobs.some(j => j.slot === s.id));
    const guaranteed = guaranteedSlots.flatMap(s => {
      const facts = preferredFacts.get(s.id);
      return facts ? [{ name: facts.name, foundations: facts.foundations }] : [];
    });
    errors.push(...graphProblems([{ name: input.name as string, foundations: context.authority }, ...guaranteed]));
    const targetQuestion = byId.get("targets");
    const defaults = targetQuestion && !targetQuestion.askWhen && targetQuestion.default !== undefined ? { targets: targetQuestion.default } : {};
    for (const [label, answers] of [["default", tests.defaultAnswers], ...tests.answerSets.map(s => [s.id, { ...tests.defaultAnswers, ...s.answers }] as const)] as const) {
      try {
        const selected = selectedTargets(context.authority, { ...defaults, ...answers });
        errors.push(...graphProblems(guaranteed, selected).map(p => `tests.${label}: ${p}`));
        for (const slot of guaranteedSlots) {
          const facts = preferredFacts.get(slot.id);
          if (facts) errors.push(...fit(slot.class, facts, context.authority, selected).map(p => `tests.${label}.${slot.id}: ${p}`));
        }
      } catch (error) { errors.push(`tests.${label}: ${(error as Error).message}`); }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    recipe: {
      format: RECIPE_FORMAT,
      name: input.name as string,
      version: input.version as string,
      title: (input.title as string).trim(),
      summary: (input.summary as string).trim(),
      category: input.category as string,
      tags,
      targets,
      components: slots,
      jobs,
      scale,
      questions,
      connections,
      tests,
      page,
      instructions: input.instructions as string,
    },
  };
}

function readLoad(value: unknown, where: string, errors: string[]): Record<string, number> {
  if (!isRecord(value)) {
    errors.push(`${where} must be an object of maxima`);
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(value)) {
    if (!IDENTIFIER.test(key) || typeof v !== "number" || !Number.isFinite(v) || v < 0) errors.push(`${where}.${key.slice(0, 40)} must be a non-negative number`);
    else out[key] = v;
  }
  return out;
}

// ---------------------------------------------------------------- recipe publication

// What a developer sends to publish a recipe version: recipe.json, where the release is, and the page material.
// The fields every component and recipe entry carries besides its own.
export interface EntryCommon {
  release: ReleaseChannel;
  images: PackageImage[];
  vulnerabilityWaivers: VulnerabilityWaiver[];
  // Only the catalogue's curators send it; see the publish routes.
  quality: Quality | null;
}

function readCommon(input: Rec, version: unknown, platforms: string[], errors: string[]): EntryCommon {
  const release = readReleaseChannel(input.release, version, errors);
  const images = readImages(input.images, platforms, errors);
  const vulnerabilityWaivers = readWaivers(input.vulnerabilityWaivers, errors);
  let quality: Quality | null = null;
  if (input.quality !== undefined && input.quality !== null) {
    const q = validateQuality(input.quality);
    if (q.ok) quality = q.quality;
    else errors.push(...q.errors);
  }
  return { release, images, vulnerabilityWaivers, quality };
}

const COMMON_FIELDS = ["release", "images", "vulnerabilityWaivers", "quality"];

export interface RecipeEntry extends EntryCommon {
  foundations: Foundations;
  format: 3;
  recipe: Recipe;
  digest: string;
  source: ReleasePointer;
  bundle: BundlePointer;
  page: { description: string; diagram: string | null };
}

// SVG that is safe to show: no scripts, no embedded objects, no external references.
export function isSafeSvg(svg: unknown): svg is string {
  if (typeof svg !== "string" || svg.length > LIMITS.diagram) return false;
  if (!/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(svg)) return false;
  if (/<\s*(script|foreignObject|iframe|object|embed|style\b[^>]*@import)|<!DOCTYPE|<!ENTITY|javascript:|\son[a-z]+\s*=/i.test(svg)) return false;
  for (const match of svg.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!match[1].startsWith("#")) return false;
  if (/url\(\s*["']?(?!#)/i.test(svg)) return false;
  return true;
}

export function validateRecipeEntry(input: unknown, context: RecipeContext = {}): Result<"entry", RecipeEntry> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["the body must be a JSON object"] };
  unknownKeys(input, ["format", "recipe", "digest", "source", "bundle", "page", "foundations", ...COMMON_FIELDS], "body", errors);
  readEntryFormat(input.format, errors);
  const foundationErrors = validateFoundations(input.foundations, "recipe", Object.values(GRAMMAR_PATTERNS));
  errors.push(...foundationErrors);
  const recipe = validateRecipe(input.recipe, { ...context, ...(foundationErrors.length === 0 ? { authority: input.foundations as Foundations } : {}) });
  if (!recipe.ok) errors.push(...recipe.errors.map((e) => `recipe: ${e}`));
  if (!isDigest(input.digest)) errors.push("digest must be sha256:<64 lowercase hex>");
  const release = readRelease(input.source, input.bundle, errors);
  const common = readCommon(input, isRecord(input.recipe) ? input.recipe.version : undefined, isRecord(input.foundations) && Array.isArray(input.foundations.platforms) ? (input.foundations.platforms as string[]) : [], errors);
  if (recipe.ok && recipe.recipe.targets.client.length > 0 && common.images.length === 0) errors.push("images: a recipe with a client target needs at least one image of the application as built");
  const page: RecipeEntry["page"] = { description: "", diagram: null };
  if (!isRecord(input.page)) errors.push("page must be an object with description and diagram");
  else {
    unknownKeys(input.page, ["description", "diagram"], "page", errors);
    if (!text(input.page.description, LIMITS.description)) errors.push(`page.description must be text of at most ${LIMITS.description} characters`);
    else page.description = input.page.description.replace(/\r\n/g, "\n");
    if (input.page.diagram !== undefined && input.page.diagram !== null) {
      if (!isSafeSvg(input.page.diagram)) errors.push("page.diagram must be an SVG without scripts, embedded objects or external references, of at most 200000 characters");
      else page.diagram = input.page.diagram;
    }
  }
  if (errors.length > 0 || !recipe.ok) return { ok: false, errors };
  return { ok: true, entry: { format: ENTRY_FORMAT, foundations: input.foundations as Foundations, recipe: recipe.recipe, digest: input.digest as string, ...release, page, ...common } };
}

// ---------------------------------------------------------------- component catalogue entry

export interface Port {
  id: string;
  type: string;
  version: string;
  // A requirement marked optional may stay unconnected. Only requires entries carry it.
  optional?: boolean;
}

export interface Profile {
  id: string;
  load: Record<string, number>;
  cost: CostKind;
  regions: string[];
  compliance: string[];
  provider: { name: string; tier: string; limitsSource: string | null } | null;
  notes: string;
  // Setting values the profile applies when it is selected, by setting id.
  settings?: SettingValues;
}

export interface Suitability {
  format: 1;
  jobs: string[];
  profiles: Profile[];
  notes: string;
}

// What the catalogue shows of migration.json.
export interface MigrationSummary {
  stores: { id: string; schema: { name: string; version: string } }[];
  formats: string[];
  portable: boolean;
  requiresStop: boolean;
  retentionDays: number | null;
}

// A component another component builds on, by exact name and version.
export interface ComponentDependency {
  name: string;
  version: string;
}

// A provided or required interface as a component entry carries it, with the description its interface document gives.
export interface EntryPort extends Port {
  description: string;
}

export interface ComponentEntry extends EntryCommon {
  foundations: Foundations;
  format: 4;
  name: string;
  version: string;
  digest: string;
  description: string;
  // Markdown for the component's page: what it is first, then sections under level-2 headings. A section headed
  // "Examples" is shown with the opening text, one headed "Settings" with the settings table, the rest below them.
  page: { description: string };
  tags: string[];
  targets: Targets;
  guardians: string[];
  provides: EntryPort[];
  requires: EntryPort[];
  // Setting declarations and descriptive interface document facts.
  settings: SettingDeclaration[];
  interfaceDigests: Record<string, string>;
  interfaceModules: Record<string, Record<string, EntryModule>>;
  dependencies: ComponentDependency[];
  suitability: Suitability;
  migration: MigrationSummary | null;
  source: ReleasePointer;
  bundle: BundlePointer;
}

const COMPONENT_FIELDS = [...COMMON_FIELDS, "format", "name", "version", "digest", "description", "page", "tags", "targets", "guardians", "provides", "requires", "settings", "interfaceDigests", "interfaceModules", "dependencies", "suitability", "migration", "source", "bundle", "foundations"];

export const PORT_DESCRIPTION = 2_000;

function readPorts(value: unknown, where: string, errors: string[], allowOptional = false): EntryPort[] {
  if (!Array.isArray(value) || value.length > 50) {
    errors.push(`${where} must be a list of at most 50 interfaces`);
    return [];
  }
  const out: EntryPort[] = [];
  value.forEach((p, i) => {
    const at = `${where}[${i}]`;
    if (!isRecord(p)) return void errors.push(`${at} must be an object`);
    unknownKeys(p, allowOptional ? ["id", "type", "version", "description", "optional"] : ["id", "type", "version", "description"], at, errors);
    if (!text(p.description, PORT_DESCRIPTION, 0)) errors.push(`${at}.description must be text of at most ${PORT_DESCRIPTION} characters: the interface document's description`);
    if (typeof p.id !== "string" || !IDENTIFIER.test(p.id)) errors.push(`${at}.id must be an identifier`);
    else if (out.some((o) => o.id === p.id)) errors.push(`${at}.id ${p.id} is used twice`);
    if (!isInterfaceType(p.type)) errors.push(`${at}.type must be an interface type <namespace>/<name> such as com.clodhub/card-deck`);
    else if (typeof p.id === "string" && p.id !== portId(p.type)) errors.push(`${at}.id must be ${portId(p.type)}, the last segment of its type ${p.type}`);
    if (!isVersion(p.version)) errors.push(`${at}.version must be three integers`);
    if (allowOptional && p.optional !== undefined && typeof p.optional !== "boolean") errors.push(`${at}.optional must be true or false`);
    out.push({ id: String(p.id), type: String(p.type), version: String(p.version), description: typeof p.description === "string" ? p.description.trim() : "", ...(allowOptional && p.optional === true ? { optional: true } : {}) });
  });
  return out;
}

// component.json `collect` as the entry carries it: { id, type, grammar, required, secret, hasDefault, default } per
// setting, with default exactly when hasDefault is true.
function readSettings(value: unknown, errors: string[]): SettingDeclaration[] {
  if (!Array.isArray(value) || value.length > LIMITS.settings) {
    errors.push(`settings must be a list of at most ${LIMITS.settings} settings: { id, type, grammar, required, secret, hasDefault, default } for each entry of component.json collect`);
    return [];
  }
  const out: SettingDeclaration[] = [];
  value.forEach((s, i) => {
    const at = `settings[${i}]`;
    if (!isRecord(s)) return void errors.push(`${at} must be an object`);
    unknownKeys(s, ["id", "type", "grammar", "required", "secret", "hasDefault", "default"], at, errors);
    if (typeof s.id !== "string" || !IDENTIFIER.test(s.id)) errors.push(`${at}.id must be an identifier`);
    else if (out.some((o) => o.id === s.id)) errors.push(`${at}.id ${s.id} is used twice`);
    const type = (SETTING_TYPES as readonly unknown[]).includes(s.type) ? (s.type as SettingType) : null;
    if (!type) errors.push(`${at}.type must be one of ${SETTING_TYPES.join(", ")}`);
    else if (type === "string" ? !(typeof s.grammar === "string" && s.grammar in GRAMMAR_PATTERNS) : s.grammar !== type) errors.push(`${at}.grammar must be ${type === "string" ? `one of ${Object.keys(GRAMMAR_PATTERNS).join(", ")}` : type}`);
    for (const key of ["required", "secret", "hasDefault"] as const) if (typeof s[key] !== "boolean") errors.push(`${at}.${key} must be true or false`);
    if (s.secret === true && s.hasDefault === true) errors.push(`${at}: a secret setting has no default`);
    if (s.hasDefault === true && !settingValueFits(type, String(s.grammar), s.default)) errors.push(`${at}.default must be the setting's default value: ${type === "string" ? `a string of grammar ${String(s.grammar)}` : type === "integer" ? "an integer" : "true or false"}`);
    if (s.hasDefault !== true && s.default !== undefined) errors.push(`${at}.default is given only when hasDefault is true`);
    out.push({ id: String(s.id), type: type ?? "string", grammar: String(s.grammar), required: s.required === true, secret: s.secret === true, hasDefault: s.hasDefault === true, ...(s.hasDefault === true ? { default: s.default as SettingValue } : {}) });
  });
  return out;
}

function settingValueFits(type: SettingType | null, grammar: string, value: unknown): value is SettingValue {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "integer") return Number.isInteger(value) && (value as number) >= INT32_MIN && (value as number) <= INT32_MAX;
  return type === "string" && typeof value === "string" && matchesGrammar(grammar, value);
}

const PLATFORM = /^[a-z][a-z0-9-]{0,30}$/;

// interfaceDigests: exactly one sha256 digest per provided interface, keyed type@version.
function readInterfaceDigests(value: unknown, provides: Port[], errors: string[]): Record<string, string> {
  const keys = provides.map(interfaceKey);
  if (!isRecord(value)) {
    errors.push("interfaceDigests must map type@version of each provided interface to sha256:<64 lowercase hex> of its document");
    return {};
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`interfaceDigests.${key.slice(0, 80)} is not type@version of a provided interface`);
  for (const key of keys) if (!isDigest(value[key])) errors.push(`interfaceDigests.${key} must be sha256:<64 lowercase hex> of the interface document`);
  return Object.fromEntries(keys.filter((k) => isDigest(value[k])).map((k) => [k, value[k] as string]));
}

// interfaceModules: for provided interfaces whose document declares x-clodhub-modules, platform to { path, installed }.
function readInterfaceModules(value: unknown, provides: Port[], errors: string[]): Record<string, Record<string, EntryModule>> {
  const keys = provides.map(interfaceKey);
  if (!isRecord(value)) {
    errors.push("interfaceModules must map type@version of a provided interface to its document's x-clodhub-modules: platform to { path, installed }");
    return {};
  }
  const out: Record<string, Record<string, EntryModule>> = {};
  for (const [key, modules] of Object.entries(value)) {
    const at = `interfaceModules.${key.slice(0, 80)}`;
    if (!keys.includes(key)) {
      errors.push(`${at} is not type@version of a provided interface`);
      continue;
    }
    if (!isRecord(modules) || Object.keys(modules).length > 10) {
      errors.push(`${at} must map at most 10 platforms to { path, installed }`);
      continue;
    }
    const read: Record<string, EntryModule> = {};
    for (const [platform, m] of Object.entries(modules)) {
      const where = `${at}.${platform.slice(0, 30)}`;
      if (!PLATFORM.test(platform)) errors.push(`${where}: a platform is a lowercase name such as web or apple`);
      else if (!isRecord(m)) errors.push(`${where} must be { path, installed }`);
      else {
        unknownKeys(m, ["path", "installed"], where, errors);
        if (!(m.path === null || (typeof m.path === "string" && isPackagePath(m.path.replace(/\/$/, ""))))) errors.push(`${where}.path must be a path inside the component, or null when the document gives none`);
        if (typeof m.installed !== "boolean") errors.push(`${where}.installed must be true or false`);
        else read[platform] = { path: (m.path as string | null) ?? null, installed: m.installed };
      }
    }
    out[key] = read;
  }
  return out;
}

function readDependencies(value: unknown, self: unknown, errors: string[]): ComponentDependency[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    errors.push("dependencies must be a list of at most 50 components");
    return [];
  }
  const out: ComponentDependency[] = [];
  value.forEach((d, i) => {
    const at = `dependencies[${i}]`;
    if (!isRecord(d)) return void errors.push(`${at} must be an object`);
    unknownKeys(d, ["name", "version"], at, errors);
    if (!isCatalogueName(d.name, "component")) errors.push(`${at}.name must be ${nameRule("component")}`);
    else if (d.name === self) errors.push(`${at}.name cannot be the component itself`);
    else if (out.some((o) => o.name === d.name)) errors.push(`${at}.name ${d.name} is used twice`);
    if (!isPackageVersion(d.version)) errors.push(`${at}.version must be three integers`);
    out.push({ name: String(d.name), version: String(d.version) });
  });
  return out;
}

// suitability.json, format 1.
export function validateSuitability(input: unknown, where = "suitability"): Result<"suitability", Suitability> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: [`${where} must be an object`] };
  unknownKeys(input, ["format", "jobs", "profiles", "notes"], where, errors);
  if (input.format !== CATALOGUE_FORMAT) errors.push(`${where}.format must be ${CATALOGUE_FORMAT}`);
  const jobs = stringList(input.jobs, `${where}.jobs`, errors, { max: 20, item: (v) => typeof v === "string" && SLUG.test(v) && v.length <= 40, what: "job names" });
  if (jobs.length === 0) errors.push(`${where}.jobs needs at least one job`);
  const profiles: Profile[] = [];
  if (!Array.isArray(input.profiles) || input.profiles.length === 0 || input.profiles.length > 10) errors.push(`${where}.profiles must be a list of 1 to 10 profiles`);
  else
    input.profiles.forEach((p, i) => {
      const at = `${where}.profiles[${i}]`;
      if (!isRecord(p)) return void errors.push(`${at} must be an object`);
      unknownKeys(p, ["id", "load", "cost", "regions", "compliance", "provider", "notes", "settings"], at, errors);
      if (typeof p.id !== "string" || !IDENTIFIER.test(p.id)) errors.push(`${at}.id must be an identifier`);
      else if (profiles.some((o) => o.id === p.id)) errors.push(`${at}.id ${p.id} is used twice`);
      const load = readLoad(p.load, `${at}.load`, errors);
      if (!(COST_KINDS as readonly unknown[]).includes(p.cost)) errors.push(`${at}.cost must be one of ${COST_KINDS.join(", ")}`);
      const item = (v: unknown) => typeof v === "string" && v.length >= 1 && v.length <= 60;
      const regions = stringList(p.regions, `${at}.regions`, errors, { max: 30, item, what: "regions" });
      if (regions.length === 0) errors.push(`${at}.regions needs at least one region (any for no restriction)`);
      const compliance = stringList(p.compliance, `${at}.compliance`, errors, { max: 20, item, what: "compliance labels" });
      let provider: Profile["provider"] = null;
      if (p.provider !== undefined && p.provider !== null) {
        const pr = p.provider;
        if (!isRecord(pr) || !text(pr.name, 80) || !text(pr.tier, 40) || !(pr.limitsSource === null || isHttpsUrl(pr.limitsSource))) errors.push(`${at}.provider needs name, tier and limitsSource (an https URL or null)`);
        else {
          unknownKeys(pr, ["name", "tier", "limitsSource"], `${at}.provider`, errors);
          provider = { name: String(pr.name), tier: String(pr.tier), limitsSource: pr.limitsSource as string | null };
        }
      }
      if (p.notes !== undefined && !text(p.notes, 1000, 0)) errors.push(`${at}.notes must be text of at most 1000 characters`);
      let settings: SettingValues | undefined;
      if (p.settings !== undefined) {
        if (!isRecord(p.settings) || Object.keys(p.settings).length > 50 || !Object.entries(p.settings).every(([k, v]) => IDENTIFIER.test(k) && isLiteral(v) && !(typeof v === "string" && v.startsWith("$")))) errors.push(`${at}.settings must map setting ids to string, number or boolean values`);
        else settings = p.settings as SettingValues;
      }
      profiles.push({ id: String(p.id), load, cost: p.cost as CostKind, regions, compliance, provider, notes: typeof p.notes === "string" ? p.notes : "", ...(settings ? { settings } : {}) });
    });
  if (input.notes !== undefined && !text(input.notes, 2000, 0)) errors.push(`${where}.notes must be text of at most 2000 characters`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, suitability: { format: 1, jobs, profiles, notes: typeof input.notes === "string" ? input.notes : "" } };
}

function readMigrationSummary(input: unknown, where: string, errors: string[]): MigrationSummary | null {
  if (input === null) return null;
  if (!isRecord(input)) {
    errors.push(`${where} must be null or an object`);
    return null;
  }
  unknownKeys(input, ["stores", "formats", "portable", "requiresStop", "retentionDays"], where, errors);
  const stores: MigrationSummary["stores"] = [];
  if (!Array.isArray(input.stores) || input.stores.length === 0 || input.stores.length > 20) errors.push(`${where}.stores must be a list of 1 to 20 stores`);
  else
    input.stores.forEach((s, i) => {
      const schema = isRecord(s) ? s.schema : null;
      if (!isRecord(s) || typeof s.id !== "string" || !IDENTIFIER.test(s.id) || !isRecord(schema) || !isInterfaceType(schema.name) || !isVersion(schema.version)) return void errors.push(`${where}.stores[${i}] needs an id and a schema name <namespace>/<name> and version`);
      stores.push({ id: s.id, schema: { name: String(schema.name), version: String(schema.version) } });
    });
  const formats = stringList(input.formats, `${where}.formats`, errors, { max: 10, item: (v) => typeof v === "string" && SLUG.test(v) && v.length <= 30, what: "format names" });
  if (input.portable !== true) errors.push(`${where}.portable must be true: every data-keeping component offers a portable format`);
  if (typeof input.requiresStop !== "boolean") errors.push(`${where}.requiresStop must be true or false`);
  if (!(input.retentionDays === null || (Number.isSafeInteger(input.retentionDays) && (input.retentionDays as number) >= 0))) errors.push(`${where}.retentionDays must be null or a non-negative integer`);
  return { stores, formats, portable: true, requiresStop: input.requiresStop === true, retentionDays: (input.retentionDays as number | null) ?? null };
}

// migration.json (format 1) to the summary the catalogue shows.
export function summariseMigration(input: unknown): Result<"migration", MigrationSummary> {
  const errors: string[] = [];
  if (!isRecord(input) || input.format !== CATALOGUE_FORMAT) return { ok: false, errors: ["migration.json must be an object with format 1"] };
  const stores = Array.isArray(input.stores) ? input.stores : [];
  const exported = Array.isArray(input.export) ? input.export : [];
  const imported = Array.isArray(input.import) ? input.import : [];
  const limits = isRecord(input.limits) ? input.limits : {};
  const retention = isRecord(input.retention) ? input.retention : {};
  const portable = [...exported, ...imported].some((f) => isRecord(f) && f.portable === true);
  const formats = [...new Set([...exported, ...imported].map((f) => (isRecord(f) ? f.format : null)).filter((f): f is string => typeof f === "string"))];
  const summary = readMigrationSummary({ stores, formats, portable, requiresStop: limits.requiresStop === true, retentionDays: Number.isSafeInteger(retention.afterRemovalDays) ? retention.afterRemovalDays : null }, "migration.json", errors);
  if (errors.length > 0 || !summary) return { ok: false, errors };
  return { ok: true, migration: summary };
}

// What a recipe check reads from a component entry.
export function componentFacts(e: Pick<ComponentEntry, "foundations" | "name" | "version" | "provides" | "requires" | "settings" | "interfaceDigests" | "interfaceModules" | "suitability">): ComponentFacts {
  return { foundations: e.foundations, name: e.name, version: e.version, provides: e.provides, requires: e.requires, settings: e.settings, interfaceDigests: e.interfaceDigests, interfaceModules: e.interfaceModules, profiles: e.suitability.profiles.map((p) => ({ id: p.id, ...(p.settings ? { settings: p.settings } : {}) })) };
}

export function validateComponentEntry(input: unknown): Result<"entry", ComponentEntry> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["the body must be a JSON object"] };
  unknownKeys(input, COMPONENT_FIELDS, "component", errors);
  errors.push(...validateFoundations(input.foundations, "component", Object.values(GRAMMAR_PATTERNS)));
  readEntryFormat(input.format, errors, COMPONENT_ENTRY_FORMAT, "component entry");
  if (!isCatalogueName(input.name, "component")) errors.push(`name must be ${nameRule("component")}`);
  if (!isPackageVersion(input.version)) errors.push("version must be three integers, for example 0.1.0, with a pre-release such as -preview.1 for a preview");
  const common = readCommon(input, input.version, isRecord(input.foundations) && Array.isArray(input.foundations.platforms) ? (input.foundations.platforms as string[]) : [], errors);
  if (isRecord(input.foundations) && Array.isArray(input.foundations.implements) && input.foundations.implements.length !== 1) errors.push("foundations.implements must name exactly one class: the component's listing class");
  if (!isDigest(input.digest)) errors.push("digest must be sha256:<64 lowercase hex>");
  if (!text(input.description, LIMITS.componentDescription)) errors.push(`description must be text of at most ${LIMITS.componentDescription} characters`);
  const page: ComponentEntry["page"] = { description: "" };
  if (!isRecord(input.page)) errors.push("page must be an object with description: Markdown saying what the component is, then sections under level-2 headings");
  else {
    unknownKeys(input.page, ["description"], "page", errors);
    if (!text(input.page.description, LIMITS.description)) errors.push(`page.description must be text of at most ${LIMITS.description} characters`);
    else page.description = input.page.description.replace(/\r\n/g, "\n").trim();
  }
  const tags = readTags(input.tags, "tags", errors);
  const targets = input.targets === undefined ? { client: [], server: [] } : readTargets(input.targets, "targets", errors);
  const guardians = stringList(input.guardians ?? [], "guardians", errors, { max: 10, item: (v) => text(v, 80), what: "guardian names" });
  const provides = readPorts(input.provides, "provides", errors);
  const requires = readPorts(input.requires, "requires", errors, true);
  for (const p of provides) if (requires.some((r) => r.id === p.id)) errors.push(`interface id ${p.id} is both provided and required`);
  const settings = readSettings(input.settings, errors);
  const interfaceDigests = readInterfaceDigests(input.interfaceDigests, provides, errors);
  const interfaceModules = readInterfaceModules(input.interfaceModules, provides, errors);
  const dependencies = readDependencies(input.dependencies, input.name, errors);
  const suitability = validateSuitability(input.suitability);
  if (!suitability.ok) errors.push(...suitability.errors);
  const migration = readMigrationSummary(input.migration ?? null, "migration", errors);
  const release = readRelease(input.source, input.bundle, errors);
  if (errors.length > 0 || !suitability.ok) return { ok: false, errors };
  return {
    ok: true,
    entry: {
      foundations: input.foundations as Foundations,
      format: COMPONENT_ENTRY_FORMAT,
      name: input.name as string,
      version: input.version as string,
      digest: input.digest as string,
      description: (input.description as string).trim(),
      page,
      ...common,
      tags,
      targets,
      guardians,
      provides,
      requires,
      settings,
      interfaceDigests,
      interfaceModules,
      dependencies,
      suitability: suitability.suitability,
      migration,
      ...release,
    },
  };
}
