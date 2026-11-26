// The recipe library, the component catalogue and the class entries: public reads, and publishing by a signed-in
// developer or a manage key. D1 holds the listing and pointers; R2 holds each version's document and the images; the
// packages stay in the publisher's GitHub releases.
import {
  CATEGORY_PATH,
  isAssetName,
  FOUNDATION_PLATFORMS,
  validLicence,
  CHANNELS,
  DEPRECATED_FILTERS,
  IMAGE_LIMITS,
  NEIGHBOURS_SHOWN,
  PAGE_SIZE,
  QUALITY_LEVELS,
  SORTS,
  classDescriptor,
  componentConnectionsSvg,
  componentFacts,
  isCatalogueName,
  isCatalogueSlug,
  isInterfaceType,
  purlPackage,
  nameRule,
  namespaceOwner,
  isPackageVersion,
  packageContents,
  recipeComponentsSvg,
  slotClass,
  splitName,
  summariseFoundations,
  validateCategories,
  validateClassEntry,
  validateComponentEntry,
  validateQuality,
  validateRecipeEntry,
  versionLine,
  type Advisory,
  type BuildReport,
  type BuildReportList,
  type BuildReportView,
  validateBuildReport,
  canonical,
  type ClassDescriptor,
  type BundleLink,
  type CategoryCount,
  type Channel,
  type ClassList,
  type ClassSummary,
  type ClassVersionView,
  type ComponentEntry,
  type ComponentFacts,
  type ComponentList,
  type ComponentSummary,
  type ComponentVersionView,
  type Deprecation,
  type DeprecationReport,
  type Foundations,
  type ImageView,
  type ListQuery,
  type PackageDetails,
  type PackageImage,
  type Quality,
  type RecipeContext,
  type RecipeEntry,
  type RecipeList,
  type RecipeSummary,
  type RecipeVersionView,
  type SlotDetails,
  type Sort,
  type VulnerabilityReport,
} from "@clodhub/shared";
import { audit } from "../audit.js";
import type { AuthedDeveloper } from "../auth.js";
import { classListText, classText, categoriesText, componentDetailsText, componentListText, componentText, recipeDetailsText, recipeListText, recipeText } from "../catalogue-text.js";
import { CatalogueDb, entryStatus, type EntryRow, type Kind, type Listing, type SummaryRow, type VersionRow } from "../catalogue-db.js";
import { imageFacts, IMAGE_METADATA_BYTES, imageKey, putDocument, readDocument, readDocuments, sha256Hex } from "../catalogue-store.js";
import { randomId } from "../crypto.js";
import type { Deps, Env } from "../env.js";
import { dlUrl, verifyLink } from "../links.js";
import { HttpError, json, readJson } from "../http.js";
import { loadSecrets } from "../secrets.js";
import { fetchUpstream } from "../upstream.js";

export const MAX_RECIPES_PER_DEVELOPER = 50;
export const MAX_COMPONENTS_PER_DEVELOPER = 200;
export const MAX_VERSIONS_PER_ENTRY = 200;
export const MAX_CLASSES_PER_DEVELOPER = 200;
export const DEFAULT_IMAGE_UPLOADS_PER_DAY = 300;
export const DEFAULT_BUNDLE_LINKS_PER_MINUTE = 60;

const SECRET_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\b(?:oa|ch)_[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b/;

type Plural = "recipes" | "components";
const plural = (kind: Kind): Plural => (kind === "recipe" ? "recipes" : "components");

// ---------------------------------------------------------------- reading parameters

function db(env: Env): CatalogueDb {
  return new CatalogueDb(env.DB);
}

type Check = RegExp | ((value: string) => boolean);
const passes = (check: Check, value: string): boolean => (typeof check === "function" ? check(value) : check.test(value));

function word(url: URL, key: string, check: Check): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  if (!value) return undefined;
  if (!passes(check, value)) throw new HttpError(400, `${key} is not valid`);
  return value;
}

function oneOf<T extends string>(url: URL, key: string, values: readonly T[]): T | undefined {
  const value = url.searchParams.get(key)?.trim();
  if (!value) return undefined;
  if (!(values as readonly string[]).includes(value)) throw new HttpError(400, `${key} must be one of ${values.join(", ")}`);
  return value as T;
}

function yes(url: URL, key: string): boolean | undefined {
  const value = url.searchParams.get(key)?.trim();
  if (!value) return undefined;
  if (value !== "true" && value !== "false") throw new HttpError(400, `${key} must be true or false`);
  return value === "true";
}

function intParam(url: URL, key: string, fallback: number, min: number, max: number): number {
  const value = url.searchParams.get(key);
  if (value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${key} must be a whole number from ${min} to ${max}`);
  return n;
}

// Every value of a repeated parameter: a component must match each one.
function words(url: URL, key: string, check: Check, max: number): string[] | undefined {
  const values = [...new Set(url.searchParams.getAll(key).map((v) => v.trim()).filter(Boolean))];
  if (values.length > max) throw new HttpError(400, `${key} may be given at most ${max} times`);
  for (const value of values) if (!passes(check, value)) throw new HttpError(400, `${key} is not valid`);
  return values.length === 0 ? undefined : values;
}

// The listing parameters. The page, its .txt and its .json and /api/<kind> all read these.
export function listQuery(url: URL, kind: Kind): ListQuery {
  const q = url.searchParams.get("q")?.trim() || undefined;
  if (q && q.length > 200) throw new HttpError(400, "q is at most 200 characters");
  const sort = oneOf<Sort>(url, "sort", SORTS) ?? (q ? "relevance" : "downloads");
  if (sort === "relevance" && !q) throw new HttpError(400, "sort=relevance needs q");
  const query: ListQuery = {
    q,
    category: word(url, "category", CATEGORY_PATH),
    class: kind === "component" ? word(url, "class", (v) => isCatalogueName(v, "class")) : undefined,
    platform: oneOf(url, "platform", FOUNDATION_PLATFORMS),
    licence: licenceParam(url),
    quality: oneOf(url, "quality", QUALITY_LEVELS),
    certified: yes(url, "certified"),
    channel: oneOf<Channel>(url, "channel", CHANNELS),
    secure: yes(url, "secure"),
    publisher: word(url, "publisher", /^[a-z0-9-]{1,40}$/),
    provides: kind === "component" ? words(url, "provides", isInterfaceType, 10) : undefined,
    requires: kind === "component" ? words(url, "requires", isInterfaceType, 10) : undefined,
    deprecated: oneOf(url, "deprecated", DEPRECATED_FILTERS) ?? "include",
    sort,
    cursor: word(url, "cursor", /^[A-Za-z0-9_-]{1,400}$/),
    limit: intParam(url, "limit", PAGE_SIZE, 1, 100),
  };
  for (const key of Object.keys(query) as (keyof ListQuery)[]) if (query[key] === undefined) delete query[key];
  return query;
}

function licenceParam(url: URL): string | undefined {
  const value = url.searchParams.get("licence")?.trim();
  if (!value) return undefined;
  if (value.length > 100 || !validLicence(value)) throw new HttpError(400, "licence must be an SPDX licence expression such as MIT or Apache-2.0");
  return value;
}

function routeSlug(input: string): string {
  if (!isCatalogueSlug(input)) throw new HttpError(404, "not found");
  return input;
}

function versionOf(input: string): string {
  if (input !== "latest" && !isPackageVersion(input)) throw new HttpError(404, "not found");
  return input;
}

const publisher = (r: { publisherSlug: string | null; publisherName: string | null }) => (r.publisherSlug === null ? null : { slug: r.publisherSlug, displayName: r.publisherName ?? r.publisherSlug });

const hexOf = (digest: string): string => digest.replace(/^sha256:/, "");
export const thumbnailUrl = (env: Env, digest: string | null): string | null => (digest ? `${env.PUBLIC_ORIGIN}/images/${hexOf(digest)}.webp` : null);

// ---------------------------------------------------------------- summaries and views

function summaryCommon(env: Env, kind: Kind, e: SummaryRow, deprecations: Deprecation[]) {
  return {
    name: e.name,
    slug: e.slug,
    version: e.latestVersion ?? "",
    category: e.category,
    platforms: e.platforms,
    licence: e.licence,
    quality: e.quality,
    channel: e.channel,
    vulnerabilities: e.vulnerabilities,
    thumbnail: thumbnailUrl(env, e.thumbnail),
    downloads: e.downloads,
    updatedAt: e.publishedAt,
    publishedAt: e.publishedAt,
    tags: e.tags,
    publisher: publisher(e),
    repository: e.repo,
    url: `${env.PUBLIC_ORIGIN}/${plural(kind)}/${e.slug}`,
    status: entryStatus(e.developerId, e.flag),
    deprecations,
  };
}

export function recipeSummary(env: Env, e: SummaryRow, deprecations: Deprecation[]): RecipeSummary {
  return { ...summaryCommon(env, "recipe", e, deprecations), title: e.title, summary: e.summary, targets: e.targets };
}

export function componentSummary(env: Env, e: SummaryRow, deprecations: Deprecation[]): ComponentSummary {
  return { ...summaryCommon(env, "component", e, deprecations), description: e.description, class: { name: e.className ?? "", version: e.classVersion ?? "", title: e.classTitle ?? "" }, targets: e.targets };
}

// The entry's row with the shown version's own facts in place of the newest version's.
function asVersion(e: SummaryRow, v: VersionRow): SummaryRow {
  const l = v.listing;
  return { ...e, ...l, latestVersion: v.version, quality: v.quality, channel: v.channel, vulnerabilities: v.vulnerabilities, publishedAt: v.publishedAt, category: l.category, licence: l.licence, thumbnail: l.thumbnail };
}

const subject = (kind: Kind, e: EntryRow, version: string) => ({ kind, entryId: e.id, name: e.name, version, developerId: e.developerId, flag: e.flag });

async function imageViews(env: Env, d: CatalogueDb, images: PackageImage[]): Promise<ImageView[]> {
  const known = await d.images(images.map((i) => hexOf(i.digest)), "");
  return images.map((i) => ({ url: `${env.PUBLIC_ORIGIN}/images/${hexOf(i.digest)}.${known.get(hexOf(i.digest))?.type ?? "png"}`, thumbnail: thumbnailUrl(env, i.thumbnail)!, caption: i.caption, platform: i.platform, width: i.width, height: i.height }));
}

async function versionCommon(env: Env, d: CatalogueDb, kind: Kind, e: SummaryRow, v: VersionRow) {
  const line = versionLine(v.version);
  const [images, securityReleases, versions] = await Promise.all([imageViews(env, d, v.images), d.securityReleases(kind, e.id, line), d.versions(kind, e.id)]);
  return {
    release: { channel: v.channel, fixes: v.fixes },
    line: { line, securityReleases },
    images,
    vulnerabilitySummary: { count: v.vulnerabilities, checkedAt: v.vulnerabilitiesCheckedAt, url: `${env.PUBLIC_ORIGIN}/api/${plural(kind)}/${e.slug}/${v.version}/vulnerabilities` },
    vulnerabilityWaivers: v.waivers,
    versionDownloads: v.downloads,
    digest: v.digest,
    source: { repository: v.sourceRepo, tag: v.sourceTag },
    bundle: { asset: v.bundleAsset, digest: v.bundleDigest, url: `${env.PUBLIC_ORIGIN}/api/${plural(kind)}/${e.slug}/${v.version}/bundle` },
    versions: versions.map(({ version, digest, publishedAt, channel, fixes }) => ({ version, digest, publishedAt, channel, fixes })),
  };
}

async function recipeView(env: Env, d: CatalogueDb, e: SummaryRow, v: VersionRow, doc: RecipeEntry): Promise<RecipeVersionView> {
  return (await recipeParts(env, d, e, v, doc)).view;
}

// The recipe version's view, and what its details page adds to each slot.
async function recipeParts(env: Env, d: CatalogueDb, e: SummaryRow, v: VersionRow, doc: RecipeEntry): Promise<{ view: RecipeVersionView; slots: SlotDetails[] }> {
  const recipe = doc.recipe;
  const [listed, [tree], common, alternatives, reports] = await Promise.all([
    d.catalogueFor(recipe.components.map((s) => s.preferred)),
    d.deprecationsFor([subject("recipe", e, v.version)]),
    versionCommon(env, d, "recipe", e, v),
    Promise.all(recipe.components.map((s) => d.implementationCount(s.class.name, s.preferred.name))),
    d.buildReports(e.name, 20),
  ]);
  const slots: SlotDetails[] = recipe.components.map((s, i) => ({ id: s.id, declaration: slotClass(classDescriptor(s.class, doc.foundations)!), suitability: listed[i]?.row.suitability ?? null }));
  const view: RecipeVersionView = {
    ...recipeSummary(env, asVersion(e, v), tree.notices),
    ...common,
    foundations: summariseFoundations(doc.foundations, `${env.PUBLIC_ORIGIN}/api/recipes/${e.slug}/${v.version}/details`),
    foundationEvidence: "publisher-declared",
    description: doc.page.description,
    diagram: doc.page.diagram ? `${env.PUBLIC_ORIGIN}/api/recipes/${e.slug}/${v.version}/diagram.svg` : null,
    contents: packageContents(doc.foundations),
    components: recipe.components.map((s, i) => {
      const found = listed[i] ?? null;
      const descriptor = classDescriptor(s.class, doc.foundations)!;
      return {
        ...s,
        classInfo: { title: descriptor.title, summary: descriptor.summary, url: `${env.PUBLIC_ORIGIN}/classes/${splitName(s.class.name)!.slug}` },
        preferred: { ...s.preferred, url: found ? `${env.PUBLIC_ORIGIN}/components/${found.slug}` : null },
        catalogue: found ? { description: found.row.description, profiles: found.row.suitability!.profiles.map(({ id, cost, load }) => ({ id, cost, load })), guardians: found.row.guardians, quality: found.row.quality, thumbnail: thumbnailUrl(env, found.row.listing.thumbnail) } : null,
        deprecation: tree.notices.find((n) => n.name === s.preferred.name && n.version === s.preferred.version && n.via.includes(e.name)) ?? null,
        alternatives: { count: alternatives[i]!, url: `${env.PUBLIC_ORIGIN}/components?class=${encodeURIComponent(s.class.name)}` },
      };
    }),
    jobs: recipe.jobs,
    scale: recipe.scale,
    questions: recipe.questions,
    connections: recipe.connections,
    tests: recipe.tests,
    instructions: recipe.instructions,
    buildReports: reports.map((r) => reportView(env, e.slug, r, e.latestVersion)),
  };
  return { view, slots };
}

// ---------------------------------------------------------------- build reports

function reportView(env: Env, slug: string, r: { id: string; version: string; digest: string; date: string; report: string; publishedAt: string }, current: string | null): BuildReportView & { report: BuildReport } {
  const report = JSON.parse(r.report) as BuildReport;
  return {
    id: r.id,
    version: r.version,
    digest: r.digest,
    date: r.date,
    publishedAt: r.publishedAt,
    current: r.version === current,
    agent: { harness: report.agent.harness, model: report.agent.model },
    activeMinutes: report.measured.activeMinutes,
    costUsd: report.measured.costUsd,
    results: report.results,
    problems: report.problems,
    rating: report.rating,
    url: `${env.PUBLIC_ORIGIN}/api/recipes/${slug}/reports/${r.id}`,
    report,
  };
}

// GET /api/recipes/:name/reports and /api/recipes/:name/reports/:id
export async function buildReports(env: Env, name: string, id: string | null): Promise<Response> {
  const d = db(env);
  const entry = await d.entryBySlug("recipe", routeSlug(name));
  if (!entry) throw new HttpError(404, "not found");
  const views = (await d.buildReports(entry.name, 200)).map((r) => reportView(env, entry.slug, r, entry.latestVersion));
  if (id !== null) {
    const one = views.find((v) => v.id === id);
    if (!one) throw new HttpError(404, "not found");
    return json(one);
  }
  return json({ name: entry.name, currentVersion: entry.latestVersion, reports: views } satisfies BuildReportList);
}

// A listed recipe version with a report of its digest whose every target built is integration-tested, unless it is
// rated higher. Runs when a report arrives and when the version is published, whichever comes second.
async function applyReports(d: CatalogueDb, slug: string, name: string, version: string): Promise<void> {
  const listed = await d.version("recipe", slug, version, true);
  if (!listed) return;
  const q = listed.row.quality;
  if (q !== null && QUALITY_LEVELS.indexOf(q.level) >= QUALITY_LEVELS.indexOf("integration-tested")) return;
  const reports = (await d.buildReports(name, 200)).filter((r) => r.version === version && r.digest === listed.row.digest);
  if (!reports.some((r) => (JSON.parse(r.report) as BuildReport).results.every((x) => x.built))) return;
  await d.setQuality("recipe", listed.entry, version, { level: "integration-tested", certified: q?.certified ?? false, liveTested: null });
}

// POST /api/dev/recipes/:name/reports with a build report. Curators only. The report's version must have been published
// under the name with that digest, now or before; the same report again answers "unchanged".
export async function publishBuildReport(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, name: string): Promise<Response> {
  if (!curator(env, dev)) throw new HttpError(403, "only the catalogue's curators publish build reports");
  const body = await readJson<unknown>(request);
  if (SECRET_PATTERN.test(JSON.stringify(body))) throw new HttpError(400, "the report appears to contain a secret; reports name secrets, never hold them");
  const result = validateBuildReport(body);
  if (!result.ok) throw new HttpError(400, `invalid report: ${result.errors.slice(0, 10).join("; ")}${result.errors.length > 10 ? `; and ${result.errors.length - 10} more` : ""}`);
  const r = result.report;
  const d = db(env);
  const entry = await d.entryBySlug("recipe", routeSlug(name));
  if (!entry) throw new HttpError(404, "not found");
  if (entry.name !== r.recipe.name) throw new HttpError(400, `the report is of ${r.recipe.name}, not ${entry.name}`);
  const now = deps.now();
  if (r.date > new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)) throw new HttpError(400, "date is in the future");
  const digest = await d.publishedDigest("recipe", entry.name, r.recipe.version);
  if (digest === null) throw new HttpError(422, `${entry.name} ${r.recipe.version} has never been published`);
  if (digest !== r.recipe.digest) throw new HttpError(422, `${entry.name} ${r.recipe.version} was published with digest ${digest}, not ${r.recipe.digest}`);
  const id = (await sha256Hex(new TextEncoder().encode(canonical(body)))).slice(0, 32);
  const added = await d.addBuildReport({ name: entry.name, version: r.recipe.version, id, digest, date: r.date, report: JSON.stringify(body), by: dev.id, now: now.toISOString() });
  if (added) await applyReports(d, entry.slug, entry.name, r.recipe.version);
  if (added) await audit(request, env, deps, dev.id, "recipe-report-published", `${entry.name} ${r.recipe.version} ${id}`);
  return json({ status: added ? "published" : "unchanged", id, name: entry.name, version: r.recipe.version, url: `${env.PUBLIC_ORIGIN}/api/recipes/${entry.slug}/reports/${id}` }, added ? 201 : 200);
}

async function componentView(env: Env, d: CatalogueDb, e: SummaryRow, v: VersionRow, doc: ComponentEntry): Promise<ComponentVersionView> {
  const reference = doc.foundations.implements[0]!;
  const descriptor = classDescriptor(reference, doc.foundations)!;
  const [[tree], common, usedBy, others] = await Promise.all([d.deprecationsFor([subject("component", e, v.version)]), versionCommon(env, d, "component", e, v), d.recipesUsing(e.name), d.implementationCount(reference.name, e.name)]);
  return {
    ...componentSummary(env, asVersion(e, v), tree.notices),
    ...common,
    // Format 2 documents, stored until their versions are published again in format 3, have no page.
    about: doc.page?.description ?? "",
    classInfo: { summary: descriptor.summary, url: `${env.PUBLIC_ORIGIN}/classes/${splitName(reference.name)!.slug}`, others, othersUrl: `${env.PUBLIC_ORIGIN}/components?class=${encodeURIComponent(reference.name)}` },
    contents: packageContents(doc.foundations),
    foundations: summariseFoundations(doc.foundations, `${env.PUBLIC_ORIGIN}/api/components/${e.slug}/${v.version}/details`),
    foundationEvidence: "publisher-declared",
    guardians: doc.guardians,
    provides: doc.provides.map((p) => ({ ...p, description: p.description ?? "" })),
    requires: doc.requires.map((p) => ({ ...p, description: p.description ?? "" })),
    settings: doc.settings,
    interfaceDigests: doc.interfaceDigests,
    interfaceModules: doc.interfaceModules,
    dependencies: doc.dependencies,
    suitability: doc.suitability,
    migration: doc.migration,
    usedBy: usedBy.map((u) => ({ ...u, url: `${env.PUBLIC_ORIGIN}/recipes/${u.slug}` })),
  };
}

// ---------------------------------------------------------------- listings

async function publisherId(env: Env, slug: string | undefined): Promise<string | null | undefined> {
  if (!slug) return undefined;
  const r = await env.DB.prepare("SELECT id FROM developers WHERE slug = ?").bind(slug).first<{ id: string }>();
  return r?.id ?? null;
}

async function listing(env: Env, d: CatalogueDb, kind: Kind, q: ListQuery) {
  const pid = await publisherId(env, q.publisher);
  const empty = { rows: [] as SummaryRow[], total: { count: 0, approximate: false }, next: null, previous: null };
  const [page, categories] = await Promise.all([pid === null ? Promise.resolve(empty) : d.list(kind, q, pid ?? null), d.categoryChildren(q.category ?? null)]);
  const trees = await d.deprecationsFor(page.rows.map((r) => subject(kind, r, r.latestVersion!)));
  return { page, trees, categories: categories.map((c): CategoryCount => c) };
}

export async function recipeList(env: Env, d: CatalogueDb, url: URL): Promise<RecipeList> {
  const q = listQuery(url, "recipe");
  const { page, trees, categories } = await listing(env, d, "recipe", q);
  return { query: q, total: page.total, next: page.next, previous: page.previous, categories, recipes: page.rows.map((r, i) => recipeSummary(env, r, trees[i]!.notices)) };
}

export async function componentList(env: Env, d: CatalogueDb, url: URL): Promise<ComponentList> {
  const q = listQuery(url, "component");
  const { page, trees, categories } = await listing(env, d, "component", q);
  return { query: q, total: page.total, next: page.next, previous: page.previous, categories, components: page.rows.map((r, i) => componentSummary(env, r, trees[i]!.notices)) };
}

// D1's rows read and query count for a response, so a caller can see what a page costs.
function timed(d: CatalogueDb, res: Response): Response {
  res.headers.set("Server-Timing", `d1;desc="rows read ${d.rowsRead}, queries ${d.queries}"`);
  res.headers.set("X-D1-Rows-Read", String(d.rowsRead));
  return res;
}

// GET /api/recipes and /api/components
export async function list(env: Env, kind: Kind, url: URL): Promise<Response> {
  const d = db(env);
  return timed(d, json(kind === "recipe" ? await recipeList(env, d, url) : await componentList(env, d, url)));
}

// ---------------------------------------------------------------- one version

async function found(env: Env, d: CatalogueDb, kind: Kind, name: string, version: string): Promise<{ entry: SummaryRow; row: VersionRow }> {
  const f = await d.version(kind, routeSlug(name), versionOf(version));
  if (!f) throw new HttpError(404, `no such ${kind} version`);
  return f;
}

async function recipeFull(env: Env, d: CatalogueDb, name: string, version: string): Promise<{ view: RecipeVersionView; slots: SlotDetails[]; details: PackageDetails; doc: RecipeEntry }> {
  const f = await found(env, d, "recipe", name, version);
  const doc = await readDocument<RecipeEntry>(env, f.row.document);
  return { ...(await recipeParts(env, d, f.entry, f.row, doc)), details: packageDetails(f.entry.name, f.row.version, doc.foundations), doc };
}

async function componentFull(env: Env, d: CatalogueDb, name: string, version: string): Promise<{ view: ComponentVersionView; details: PackageDetails; doc: ComponentEntry }> {
  const f = await found(env, d, "component", name, version);
  const doc = await readDocument<ComponentEntry>(env, f.row.document);
  return { view: await componentView(env, d, f.entry, f.row, doc), details: packageDetails(f.entry.name, f.row.version, doc.foundations), doc };
}

const packageDetails = (name: string, version: string, foundations: Foundations): PackageDetails => ({ name, version, foundationEvidence: "publisher-declared", foundations });

// GET /api/recipes/:name/:version and /api/components/:name/:version (version may be "latest")
export async function versionView(env: Env, kind: Kind, name: string, version: string): Promise<Response> {
  const d = db(env);
  const body = kind === "recipe" ? (await recipeFull(env, d, name, version)).view : (await componentFull(env, d, name, version)).view;
  return timed(d, json(body));
}

// GET /api/{recipes,components}/:name/:version/details
export async function versionDetails(env: Env, kind: Kind, name: string, version: string): Promise<Response> {
  const d = db(env);
  const f = await found(env, d, kind, name, version);
  const doc = await readDocument<ComponentEntry | RecipeEntry>(env, f.row.document);
  return json(packageDetails(f.entry.name, f.row.version, doc.foundations));
}

// GET /api/{recipes,components}/:name/:version/vulnerabilities
export async function vulnerabilities(env: Env, kind: Kind, name: string, version: string): Promise<Response> {
  return json(await vulnerabilityReport(env, db(env), kind, name, version));
}

// Whether an advisory's affected package (a package URL, or "<ecosystem>:<name>" when OSV gives no purl) is the package
// of a version's purl. A purl is compared decoded, so an npm scope written as "@" or as its canonical "%40" is the same.
function sameAffected(affected: string, purl: string): boolean {
  const ours = purlPackage(purl);
  if (ours === null) return false;
  if (affected.startsWith("pkg:")) return purlPackage(affected) === ours;
  return affected.endsWith(`:${ours.slice(ours.indexOf("/") + 1)}`);
}

export async function vulnerabilityReport(env: Env, d: CatalogueDb, kind: Kind, name: string, version: string): Promise<VulnerabilityReport> {
  const f = await found(env, d, kind, name, version);
  const waived = new Map(f.row.waivers.map((w) => [w.id, w.reason]));
  const advisories: Advisory[] = (await d.versionAdvisories(kind, f.entry.id, f.row.version)).map((a) => ({
    id: a.id,
    summary: a.summary,
    severity: a.severity,
    affected: a.purls,
    fixedIn: [...new Set(Object.entries(a.fixed).filter(([pkg]) => a.purls.some((p) => sameAffected(pkg, p))).flatMap(([, v]) => v))],
    waived: waived.get(a.id) ?? null,
  }));
  return { name: f.entry.name, version: f.row.version, checkedAt: f.row.vulnerabilitiesCheckedAt, count: f.row.vulnerabilities, advisories, unqueryable: await d.unqueryablePurls(kind, f.entry.id, f.row.version) };
}

const SVG_HEADERS = { "Content-Type": "image/svg+xml", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

// GET /api/recipes/:name/:version/diagram.svg
export async function recipeDiagram(env: Env, name: string, version: string): Promise<Response> {
  const d = db(env);
  const f = await found(env, d, "recipe", name, version);
  if (!f.row.hasDiagram) throw new HttpError(404, "no diagram");
  const doc = await readDocument<RecipeEntry>(env, f.row.document);
  return new Response(doc.page.diagram, { headers: { ...SVG_HEADERS, "Cache-Control": "public, max-age=300" } });
}

// GET /api/recipes/:name/:version/components.svg
export async function recipeComponentsDiagram(env: Env, name: string, version: string): Promise<Response> {
  const d = db(env);
  const f = await found(env, d, "recipe", name, version);
  const doc = await readDocument<RecipeEntry>(env, f.row.document);
  const r = doc.recipe;
  const listed = await d.catalogueFor(r.components.map((s) => s.preferred));
  const docs = await readDocuments<ComponentEntry>(env, listed.map((l) => l?.row.document ?? null));
  // Each zone is the last part of the component's category, so the cards and connections stay readable.
  const catalogue = docs.map((c, i) => (c ? { name: c.name, version: c.version, category: listed[i]!.row.listing.category.split("/").pop()!, provides: c.provides, requires: c.requires } : null));
  const svg = recipeComponentsSvg({ name: r.name, version: r.version, title: r.title, components: r.components.map((s) => ({ ...s, class: classDescriptor(s.class, doc.foundations)! })), connections: r.connections, catalogue });
  return new Response(svg, { headers: { ...SVG_HEADERS, "Cache-Control": "public, max-age=300" } });
}

// GET /api/components/:name/:version/connections.svg
export async function componentConnectionsDiagram(env: Env, name: string, version: string): Promise<Response> {
  const d = db(env);
  const f = await found(env, d, "component", name, version);
  const doc = await readDocument<ComponentEntry>(env, f.row.document);
  const lookup = async (direction: "provides" | "requires", type: string) => {
    const page = await d.list("component", { [direction]: [type], deprecated: "include", sort: "downloads", limit: NEIGHBOURS_SHOWN + 1 }, null);
    const others = page.rows.filter((x) => x.name !== doc.name);
    return { components: others.map((x) => ({ name: x.name, version: x.latestVersion!, category: x.category })), total: page.total.count - (page.rows.length - others.length) };
  };
  const pairs = async (ports: { type: string }[], direction: "provides" | "requires") => Object.fromEntries(await Promise.all([...new Set(ports.map((p) => p.type))].map(async (t) => [t, await lookup(direction, t)] as const)));
  const [providers, consumers] = await Promise.all([pairs(doc.requires, "provides"), pairs(doc.provides, "requires")]);
  const svg = componentConnectionsSvg({ name: doc.name, version: doc.version, category: f.row.listing.category, targets: doc.targets, provides: doc.provides, requires: doc.requires, profiles: doc.suitability.profiles, providers, consumers });
  return new Response(svg, { headers: { ...SVG_HEADERS, "Cache-Control": "public, max-age=300" } });
}

// ---------------------------------------------------------------- bundle links and downloads

async function releaseAsset(env: Env, deps: Deps, developerId: string | null, repo: string, tag: string, assetName: string, digest: string): Promise<{ url: string } | "unavailable"> {
  const token = developerId === null ? undefined : (await loadSecrets(env, developerId, ["githubToken"])).githubToken;
  const release = await githubRelease(env, deps, repo, tag, token);
  if (release.status === "missing" && developerId === null) return "unavailable";
  if (release.status !== "ok") throw new HttpError(502, "the release holding this bundle is not available right now");
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    if (developerId === null) return "unavailable";
    throw new HttpError(502, "the release does not hold this bundle");
  }
  if (asset.digest && asset.digest !== digest) throw new HttpError(502, "the release asset does not match the recorded digest");
  return { url: asset.url };
}

interface ReleaseAsset {
  name: string;
  url: string;
  digest?: string | null;
}

type ReleaseLookup = { status: "ok"; assets: ReleaseAsset[] } | { status: "missing" } | { status: "error" };

async function githubRelease(env: Env, deps: Deps, repo: string, tag: string, token: string | undefined): Promise<ReleaseLookup> {
  const path = tag.split("/").map(encodeURIComponent).join("/");
  let res: Response;
  try {
    res = await fetchUpstream(env, deps, `${env.GITHUB_API_BASE}/repos/${repo}/releases/tags/${path}`, token, "application/vnd.github+json");
  } catch {
    return { status: "error" };
  }
  if (res.status === 404) return { status: "missing" };
  if (!res.ok) return { status: "error" };
  const body = (await res.json().catch(() => null)) as { assets?: ReleaseAsset[] } | null;
  return { status: "ok", assets: Array.isArray(body?.assets) ? body!.assets! : [] };
}

// GET /api/{recipes,components}/:name/:version/bundle. An address may ask for BUNDLE_LINKS_PER_MINUTE links a minute;
// the first link an address gets for a version on a day counts one download. Addresses are kept only as a sha256
// salted with the day and the link secret.
export async function bundle(request: Request, env: Env, deps: Deps, kind: Kind, name: string, version: string): Promise<Response> {
  const d = db(env);
  const now = deps.now();
  const day = now.toISOString().slice(0, 10);
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const visitor = await sha256Hex(new TextEncoder().encode(`${day}|${address}|${env.LINK_SECRET ?? ""}`));
  const limit = Number(env.BUNDLE_LINKS_PER_MINUTE ?? DEFAULT_BUNDLE_LINKS_PER_MINUTE);
  if ((await d.hit(`bundle:${visitor}`, now.toISOString().slice(0, 16))) > limit) throw new HttpError(429, `at most ${limit} download links a minute; try again shortly`);
  const { entry, row } = await found(env, d, kind, name, version);
  const [tree] = await d.deprecationsFor([subject(kind, entry, row.version)]);
  const base = { name: entry.name, version: row.version, digest: row.digest, asset: row.bundleAsset, assetDigest: row.bundleDigest, deprecations: tree!.notices };
  const asset = await releaseAsset(env, deps, entry.developerId, row.sourceRepo, row.sourceTag, row.bundleAsset, row.bundleDigest);
  if (asset === "unavailable") return json({ ...base, status: "bundle-unavailable", url: null, expiresAt: null } satisfies BundleLink);
  const url = await dlUrl(env, deps, { url: asset.url, kind: "bundle", dev: entry.developerId ?? "", name: row.bundleAsset });
  const expiresAt = new Date(Math.floor(deps.now().getTime() / 1000) * 1000 + 60 * 60 * 1000).toISOString();
  await d.countDownload(kind, entry.id, row.version, day, visitor);
  return json({ ...base, status: "available", url, expiresAt } satisfies BundleLink);
}

// GET /dl/:token - streams the bundle a link names. A link with no developer is for a public release of an orphaned
// entry, so no token is sent.
export async function serveArtefact(env: Env, deps: Deps, token: string): Promise<Response> {
  if (!env.LINK_SECRET) throw new HttpError(503, "LINK_SECRET is not configured");
  const link = await verifyLink(env.LINK_SECRET, token, deps.now());
  if (!link) throw new HttpError(403, "this link has expired; ask for the bundle again");
  const githubToken = link.dev === "" ? undefined : (await loadSecrets(env, link.dev, ["githubToken"])).githubToken;
  const upstream = await fetchUpstream(env, deps, link.url, githubToken);
  if (!upstream.ok) throw new HttpError(502, `upstream returned ${upstream.status}`);
  const name = isAssetName(link.name) ? link.name : "bundle";
  return new Response(upstream.body, { status: 200, headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}

// GET /api/recipes/:name/:version/deprecations and the same for components
export async function deprecations(env: Env, kind: Kind, name: string, version: string): Promise<Response> {
  const d = db(env);
  const { entry, row } = await found(env, d, kind, name, version);
  const [tree] = await d.deprecationsFor([subject(kind, entry, row.version)]);
  const report: DeprecationReport = { name: entry.name, version: row.version, status: entryStatus(entry.developerId, entry.flag), affected: tree!.notices.length > 0, checked: tree!.checked, deprecations: tree!.notices };
  return json(report);
}

// ---------------------------------------------------------------- images

// GET /images/<sha256>.<png|webp>: the bytes never change, so caches keep them for a year.
export async function image(env: Env, file: string): Promise<Response> {
  const m = /^([0-9a-f]{64})\.(png|webp)$/.exec(file);
  if (!m) throw new HttpError(404, "not found");
  const known = await db(env).image(m[1]!);
  if (!known || known.type !== m[2]) throw new HttpError(404, "not found");
  const object = await env.CATALOGUE.get(imageKey(m[1]!));
  if (!object) throw new HttpError(404, "not found");
  return new Response(object.body, { headers: { "Content-Type": `image/${known.type}`, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", ETag: `"${m[1]}"` } });
}

// PUT /api/dev/images/:sha256 with the image bytes (image/png or image/webp). The worker checks the sha256, the type
// against the bytes and the size, and reads the width and height from the header.
export async function uploadImage(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, digest: string): Promise<Response> {
  const hex = hexOf(digest);
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new HttpError(404, "not found");
  const declared = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
  if (declared !== "image/png" && declared !== "image/webp") throw new HttpError(415, "Content-Type must be image/png or image/webp");
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > IMAGE_LIMITS.bytes) throw new HttpError(413, `an image is at most ${IMAGE_LIMITS.bytes} bytes`);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > IMAGE_LIMITS.bytes) throw new HttpError(413, `an image is 1 to ${IMAGE_LIMITS.bytes} bytes`);
  if ((await sha256Hex(bytes)) !== hex) throw new HttpError(422, "the sha256 of the bytes is not the one in the address");
  const facts = imageFacts(bytes);
  if (!facts || `image/${facts.type}` !== declared) throw new HttpError(422, `the bytes are not a complete ${declared.slice(6).toUpperCase()} image`);
  if (facts.metadata > IMAGE_METADATA_BYTES) throw new HttpError(422, `the image carries ${facts.metadata} bytes of metadata; at most ${IMAGE_METADATA_BYTES} are allowed`);
  if (facts.width < 1 || facts.height < 1 || facts.width > IMAGE_LIMITS.side || facts.height > IMAGE_LIMITS.side) throw new HttpError(422, `width and height must be 1 to ${IMAGE_LIMITS.side} pixels`);
  const d = db(env);
  const now = deps.now().toISOString();
  const unchanged = () => json({ status: "unchanged", digest: `sha256:${hex}`, type: facts.type, width: facts.width, height: facts.height, bytes: bytes.length, url: `${env.PUBLIC_ORIGIN}/images/${hex}.${facts.type}` });
  const mine = (await d.images([hex], dev.id)).get(hex);
  if (mine) await d.touchImage(hex, now);
  if (mine?.uploaded) return unchanged();
  const limit = Number(env.IMAGE_UPLOADS_PER_DAY ?? DEFAULT_IMAGE_UPLOADS_PER_DAY);
  if ((await d.imagesUploadedSince(dev.id, new Date(deps.now().getTime() - 86_400_000).toISOString())) >= limit) throw new HttpError(429, `at most ${limit} images can be uploaded a day`);
  // Bytes another developer uploaded first: this developer is recorded as an uploader too, and may name the image.
  if (mine) {
    await d.addUploader(hex, dev.id, now);
    return unchanged();
  }
  await env.CATALOGUE.put(imageKey(hex), bytes, { httpMetadata: { contentType: declared, cacheControl: "public, max-age=31536000, immutable" } });
  await d.addImage({ digest: hex, type: facts.type, width: facts.width, height: facts.height, bytes: bytes.length }, dev.id, now);
  return json({ status: "stored", digest: `sha256:${hex}`, type: facts.type, width: facts.width, height: facts.height, bytes: bytes.length, url: `${env.PUBLIC_ORIGIN}/images/${hex}.${facts.type}` }, 201);
}

// Images nobody named within a day of their latest upload are removed (hourly, a bounded number at a time).
export async function removeUnclaimedImages(env: Env, deps: Deps): Promise<number> {
  const d = db(env);
  const gone = await d.unclaimedImages(new Date(deps.now().getTime() - 86_400_000).toISOString(), 200);
  if (gone.length === 0) return 0;
  await env.CATALOGUE.delete(gone.map(imageKey));
  await d.removeImages(gone);
  return gone.length;
}

// Every listed image and thumbnail must be uploaded first, with the width and height the entry states, and be named
// by a published entry already or have been uploaded (its bytes sent) by the same developer.
async function checkImages(d: CatalogueDb, images: PackageImage[], developerId: string): Promise<void> {
  const known = await d.images(images.flatMap((i) => [hexOf(i.digest), hexOf(i.thumbnail)]), developerId);
  for (const [hex, i] of known) if (!i.claimed && !i.uploaded) known.delete(hex);
  images.forEach((i, n) => {
    const full = known.get(hexOf(i.digest));
    const thumb = known.get(hexOf(i.thumbnail));
    if (!full) throw new HttpError(422, `images[${n}].digest: upload the image first (PUT /api/dev/images/<sha256>)`);
    if (full.width !== i.width || full.height !== i.height) throw new HttpError(422, `images[${n}]: the uploaded image is ${full.width} by ${full.height}, not ${i.width} by ${i.height}`);
    if (!thumb) throw new HttpError(422, `images[${n}].thumbnail: upload the thumbnail first (PUT /api/dev/images/<sha256>)`);
    if (thumb.type !== "webp" || thumb.width > 480 || thumb.width !== Math.min(480, i.width)) throw new HttpError(422, `images[${n}].thumbnail must be a WebP ${Math.min(480, i.width)} pixels wide`);
  });
}

// ---------------------------------------------------------------- page variants

const plain = (body: string): Response => new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// A browser sends Accept with text/html; fetch tools and curl do not.
export function wantsHtml(request: Request): boolean {
  return /text\/html/i.test(request.headers.get("Accept") ?? "");
}

const SECTIONS = ["recipes", "components", "classes", "categories"] as const;
type Section = typeof SECTIONS[number];

// /recipes, /components, /classes and /categories, each with .txt and .json, one entry (/recipes/:name.txt, .json),
// and /recipes/:name/details.txt. A client that does not ask for HTML gets the plain text at the page's own address.
// Returns null for any other path. ?version= picks a version.
export function pageVariant(env: Env, parts: string[], url: URL, request?: Request): Promise<Response> | null {
  const head = /^(recipes|components|classes|categories)(?:\.(txt|json))?$/.exec(parts[0] ?? "");
  if (!head) return null;
  const section = head[1] as Section;
  const plainWanted = request ? !wantsHtml(request) : false;
  if (parts.length === 1) {
    const format = (head[2] as "txt" | "json" | undefined) ?? (plainWanted ? "txt" : null);
    return format ? sectionVariant(env, section, format, url) : null;
  }
  if (head[2] || section === "categories") return null;
  const nested = /^(.+?)(?:\.(txt|json))?$/.exec(parts[1] ?? "")!;
  if (parts.length === 2) {
    const format = (nested[2] as "txt" | "json" | undefined) ?? (plainWanted ? "txt" : null);
    return format ? entryVariant(env, section, nested[1]!, format, url) : null;
  }
  if (parts.length === 3 && section !== "classes" && (parts[2] === "details.txt" || (parts[2] === "details" && plainWanted))) return detailsText(env, section, parts[1]!, url);
  return null;
}

async function sectionVariant(env: Env, section: Section, format: "txt" | "json", url: URL): Promise<Response> {
  const d = db(env);
  const origin = env.PUBLIC_ORIGIN;
  if (section === "recipes") {
    const l = await recipeList(env, d, url);
    return timed(d, format === "json" ? json(l) : plain(recipeListText(l, origin)));
  }
  if (section === "components") {
    const l = await componentList(env, d, url);
    return timed(d, format === "json" ? json(l) : plain(componentListText(l, origin)));
  }
  if (section === "classes") {
    const l = await classList(env, d, url);
    return format === "json" ? json(l) : plain(classListText(l, origin));
  }
  const tree = { categories: await d.categories() };
  return format === "json" ? json(tree) : plain(categoriesText(tree, origin));
}

async function entryVariant(env: Env, section: Section, name: string, format: "txt" | "json", url: URL): Promise<Response> {
  const d = db(env);
  const version = url.searchParams.get("version") ?? "latest";
  const origin = env.PUBLIC_ORIGIN;
  if (section === "recipes") {
    const v = (await recipeFull(env, d, name, version)).view;
    return format === "json" ? json(v) : plain(recipeText(v, origin));
  }
  if (section === "components") {
    const v = (await componentFull(env, d, name, version)).view;
    return format === "json" ? json(v) : plain(componentText(v, origin));
  }
  const v = await classView(env, d, name, version);
  return format === "json" ? json(v) : plain(classText(v, origin));
}

async function detailsText(env: Env, what: "recipes" | "components", name: string, url: URL): Promise<Response> {
  const d = db(env);
  const version = url.searchParams.get("version") ?? "latest";
  if (what === "recipes") {
    const { view, slots, details } = await recipeFull(env, d, name, version);
    return plain(recipeDetailsText(view, slots, details, env.PUBLIC_ORIGIN));
  }
  const { view, details } = await componentFull(env, d, name, version);
  return plain(componentDetailsText(view, details, env.PUBLIC_ORIGIN));
}

// GET /sitemap.xml: the section pages and the 1,000 most downloaded recipes, components and classes.
export async function sitemap(env: Env): Promise<Response> {
  const d = db(env);
  const [recipes, components] = await Promise.all([d.list("recipe", { deprecated: "include", sort: "downloads", limit: 100 }, null), d.list("component", { deprecated: "include", sort: "downloads", limit: 100 }, null)]);
  const classes = await d.listClasses(null, null, 100);
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = ["/", "/guide", "/terms", "/small", "/recipes", "/components", "/classes", "/categories", ...recipes.rows.map((r) => `/recipes/${r.slug}`), ...components.rows.map((c) => `/components/${c.slug}`), ...classes.rows.map((c) => `/classes/${c.slug}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${escape(env.PUBLIC_ORIGIN + u)}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------------------------------------------------------------- classes and categories

function classSummary(env: Env, r: Record<string, unknown>): ClassSummary {
  return {
    name: r.name as string,
    slug: r.slug as string,
    version: r.latest_version as string,
    title: r.title as string,
    summary: r.summary as string,
    category: r.category as string,
    presentation: r.presentation as "visual" | "none",
    implementations: r.implementations as number,
    publisher: r.publisher_slug ? { slug: r.publisher_slug as string, displayName: (r.publisher_name as string | null) ?? (r.publisher_slug as string) } : null,
    url: `${env.PUBLIC_ORIGIN}/classes/${r.slug}`,
  };
}

export async function classList(env: Env, d: CatalogueDb, url: URL): Promise<ClassList> {
  const category = word(url, "category", CATEGORY_PATH) ?? null;
  const cursor = word(url, "cursor", /^[A-Za-z0-9_-]{1,400}$/) ?? null;
  const [page, categories] = await Promise.all([d.listClasses(category, cursor, intParam(url, "limit", PAGE_SIZE, 1, 100)), d.categoryChildren(category)]);
  return { classes: page.rows.map((r) => classSummary(env, r)), total: page.total, next: page.next, previous: null, categories };
}

export async function classView(env: Env, d: CatalogueDb, name: string, version: string): Promise<ClassVersionView> {
  const row = await d.classBySlug(routeSlug(name));
  if (!row) throw new HttpError(404, "no such class");
  const wanted = version === "latest" ? (row.latest_version as string) : versionOf(version);
  const v = await d.classVersion(row.id as string, wanted);
  if (!v) throw new HttpError(404, "no such class version");
  const [versions, implementations] = await Promise.all([d.classVersions(row.id as string), d.implementations(row.name as string, v.version, 100)]);
  const c = v.descriptor;
  return {
    ...classSummary(env, row),
    version: v.version,
    title: c.title,
    summary: c.summary,
    category: c.category,
    presentation: c.presentation,
    digest: v.digest,
    provides: c.provides,
    requires: c.requires,
    settings: c.settings,
    suites: c.verification.map((s) => ({ id: s.id, argv: s.argv, network: s.network, timeoutSeconds: s.timeoutSeconds })),
    versions,
    implementationList: implementations.map((e) => ({ name: e.name, slug: e.slug, version: e.latestVersion!, description: e.description, thumbnail: thumbnailUrl(env, e.thumbnail), quality: e.quality, platforms: e.platforms, downloads: e.downloads, vulnerabilities: e.vulnerabilities, url: `${env.PUBLIC_ORIGIN}/components/${e.slug}` })),
  };
}

// GET /api/classes
export async function listClasses(env: Env, url: URL): Promise<Response> {
  return json(await classList(env, db(env), url));
}

// GET /api/classes/:name/:version
export async function classDetail(env: Env, name: string, version: string): Promise<Response> {
  return json(await classView(env, db(env), name, version));
}

// GET /api/categories
export async function categories(env: Env): Promise<Response> {
  return json({ categories: await db(env).categories() });
}

// ---------------------------------------------------------------- publishing

function problems(errors: string[]): HttpError {
  return new HttpError(400, `invalid entry: ${errors.slice(0, 10).join("; ")}${errors.length > 10 ? `; and ${errors.length - 10} more` : ""}`);
}

// Curators are named by numeric GitHub user id, which a renamed account keeps.
const curator = (env: Env, dev: AuthedDeveloper) => (env.CATALOGUE_CURATORS ?? "").split(",").map((s) => s.trim()).filter(Boolean).includes(String(dev.githubId));

interface Candidate {
  kind: Kind;
  name: string;
  version: string;
  digest: string;
  source: { repository: string; tag: string };
  bundle: { asset: string; digest: string };
}

// Checks the name against the repository and the publisher, finds or makes the entry, and decides what to do with the version.
async function prepare(env: Env, d: CatalogueDb, deps: Deps, dev: AuthedDeveloper, c: Candidate): Promise<{ entry: EntryRow | null; fresh: EntryRow; existing: "none" | "same"; unlisted: boolean }> {
  const { namespace, slug } = splitName(c.name)!;
  if (!(await loadSecrets(env, dev.id, ["githubToken"])).githubToken) throw new HttpError(409, NO_SAVED_TOKEN);
  const owner = await namespacePublisher(env, deps, dev, namespace);
  if (c.source.repository.split("/")[0]!.toLowerCase() !== owner) throw new HttpError(400, `${c.name} must be published from a repository of ${owner}, the owner of the namespace ${namespace}, not ${c.source.repository}`);
  const entry = await d.entryBySlug(c.kind, slug);
  if (entry && entry.developerId === null) throw new HttpError(409, "that name belongs to a developer who deleted their account; it cannot be published to");
  if (entry && entry.developerId !== dev.id) throw new HttpError(409, "that name belongs to another developer");
  if (entry && entry.name !== c.name) throw new HttpError(409, `the name ${slug} is already published as ${entry.name}`);
  if (entry && entry.repo.toLowerCase() !== c.source.repository.toLowerCase()) throw new HttpError(409, `${entry.name} is published from ${entry.repo}; every version comes from that repository`);
  const now = deps.now().toISOString();
  const fresh: EntryRow = { seq: 0, id: entry?.id ?? randomId(8), name: c.name, namespace, slug, developerId: dev.id, repo: c.source.repository, latestVersion: null, flag: null, createdAt: now, updatedAt: now };
  if (!entry) {
    const cap = c.kind === "recipe" ? MAX_RECIPES_PER_DEVELOPER : MAX_COMPONENTS_PER_DEVELOPER;
    if (!curator(env, dev) && (await d.countByDeveloper(c.kind, dev.id)) >= cap) throw new HttpError(409, `a developer can publish at most ${cap} ${plural(c.kind)}`);
    return { entry: null, fresh, existing: "none", unlisted: false };
  }
  const known = (await d.versions(c.kind, entry.id, true)).find((v) => v.version === c.version);
  if (known) {
    if (known.digest !== c.digest) throw new HttpError(409, `version ${c.version} is already published with a different digest; publish a new version`);
    return { entry, fresh, existing: "same", unlisted: known.unlistedAt !== null };
  }
  if ((await d.countVersions(c.kind, entry.id)) >= MAX_VERSIONS_PER_ENTRY) throw new HttpError(409, `at most ${MAX_VERSIONS_PER_ENTRY} versions can be published under one name`);
  return { entry, fresh, existing: "none", unlisted: false };
}

const NO_SAVED_TOKEN = "save a GitHub token at /dev first: it checks your release and serves the bundle";

// The publisher must be able to push to the repository, and the release must hold the bundle.
async function verifyRelease(env: Env, deps: Deps, dev: AuthedDeveloper, c: Candidate): Promise<void> {
  const token = (await loadSecrets(env, dev.id, ["githubToken"])).githubToken;
  if (!token) throw new HttpError(409, NO_SAVED_TOKEN);
  let repo: Response;
  try {
    repo = await fetchUpstream(env, deps, `${env.GITHUB_API_BASE}/repos/${c.source.repository}`, token, "application/vnd.github+json");
  } catch {
    throw new HttpError(502, "GitHub could not be reached");
  }
  if (repo.status === 404) throw new HttpError(422, `your GitHub token cannot see ${c.source.repository}`);
  if (!repo.ok) throw new HttpError(502, `GitHub answered ${repo.status} for ${c.source.repository}`);
  const permissions = ((await repo.json().catch(() => ({}))) as { permissions?: { push?: boolean; maintain?: boolean; admin?: boolean } }).permissions;
  if (!permissions?.push && !permissions?.maintain && !permissions?.admin) throw new HttpError(403, `your GitHub account cannot push to ${c.source.repository}; publish only from repositories you maintain`);
  const release = await githubRelease(env, deps, c.source.repository, c.source.tag, token);
  if (release.status === "error") throw new HttpError(502, "GitHub could not return the release");
  if (release.status === "missing") throw new HttpError(422, `no published release tagged ${c.source.tag} on ${c.source.repository}`);
  const asset = release.assets.find((a) => a.name === c.bundle.asset);
  if (!asset) throw new HttpError(422, `release ${c.source.tag} has no asset named ${c.bundle.asset}`);
  if (asset.digest && asset.digest !== c.bundle.digest) throw new HttpError(422, `the digest of ${c.bundle.asset} on GitHub is ${asset.digest}, not ${c.bundle.digest}`);
}

function refuseSecrets(body: unknown): void {
  if (SECRET_PATTERN.test(JSON.stringify(body))) throw new HttpError(400, "the entry appears to contain a secret; publish references to secrets, never values");
}

// The text a publisher may change on a published component version without a new version: its description, page text
// and tags. Every other field, quality aside, must be the stored entry's.
const COMPONENT_TEXT = ["description", "page", "tags"] as const;

function textOnlyChange(before: ComponentEntry, after: ComponentEntry): boolean {
  // As stored: a JSON round trip drops fields left undefined.
  const json = (v: unknown): string => canonical(JSON.parse(JSON.stringify(v ?? null)));
  const rest = (e: ComponentEntry) => json({ ...e, description: null, page: null, tags: null, quality: null });
  return COMPONENT_TEXT.some((k) => json(before[k]) !== json(after[k])) && rest(before) === rest(after);
}

function published(env: Env, kind: Kind, status: "published" | "updated" | "unchanged", name: string, slug: string, version: string): Response {
  const base = plural(kind);
  return json({ status, name, version, url: `${env.PUBLIC_ORIGIN}/${base}/${slug}`, api: `${env.PUBLIC_ORIGIN}/api/${base}/${slug}/${version}` }, status === "published" ? 201 : 200);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// The catalogue's documents for every component version a recipe body prefers or names as a job candidate, so the
// recipe check applies the fit rule to them.
async function catalogueContext(env: Env, d: CatalogueDb, body: unknown): Promise<RecipeContext> {
  const recipe = isObject(body) && isObject(body.recipe) ? body.recipe : {};
  const refs: { name: string; version: string }[] = [];
  const add = (name: unknown, version: unknown) => {
    if (isCatalogueName(name) && isPackageVersion(version) && refs.length < 200 && !refs.some((r) => r.name === name && r.version === version)) refs.push({ name, version });
  };
  for (const s of Array.isArray(recipe.components) ? recipe.components : []) if (isObject(s) && isObject(s.preferred)) add(s.preferred.name, s.preferred.version);
  for (const j of Array.isArray(recipe.jobs) ? recipe.jobs : []) for (const c of isObject(j) && Array.isArray(j.candidates) ? j.candidates : []) if (isObject(c)) add(c.component, c.version);
  const docs = await readDocuments<ComponentEntry>(env, await d.documentKeys(refs));
  const found = new Map<string, ComponentFacts | null>(refs.map((r, i) => [`${r.name} ${r.version}`, docs[i] ? componentFacts(docs[i]!) : null]));
  return { components: { source: "the catalogue", find: (name, version) => found.get(`${name} ${version}`) ?? null } };
}

const purlsOf = (f: Foundations): string[] => [...new Set(f.upstream.map((u) => u.purl))].slice(0, 5000);

function listingOf(kind: Kind, e: ComponentEntry | RecipeEntry, category: string, cls: ClassDescriptor | null): Listing {
  const thumbnail = e.images[0]?.thumbnail ?? null;
  if (kind === "component" && cls) {
    const c = e as ComponentEntry;
    return { description: c.description, title: "", summary: "", category, className: cls.name, classVersion: cls.version, classTitle: cls.title, platforms: c.foundations.platforms, targets: c.targets, tags: c.tags, licence: c.foundations.licence, thumbnail };
  }
  const r = (e as RecipeEntry).recipe;
  return { description: "", title: r.title, summary: r.summary, category, className: null, classVersion: null, classTitle: null, platforms: e.foundations.platforms, targets: r.targets, tags: r.tags, licence: e.foundations.licence, thumbnail };
}

async function publishEntry(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, kind: Kind, e: ComponentEntry | RecipeEntry, body: unknown): Promise<Response> {
  const d = db(env);
  refuseSecrets(body);
  if (e.quality && !curator(env, dev)) throw new HttpError(403, "quality is set by the catalogue's publish tool; leave it out");
  const name = kind === "component" ? (e as ComponentEntry).name : (e as RecipeEntry).recipe.name;
  const version = kind === "component" ? (e as ComponentEntry).version : (e as RecipeEntry).recipe.version;
  let category: string;
  let publishedClass: ClassDescriptor | null = null;
  if (kind === "component") {
    // The category and class come from the published class, never from the component's own copy.
    const c = e as ComponentEntry;
    const ref = c.foundations.implements[0]!;
    const row = await d.classByName(ref.name);
    const version = row ? await d.classVersion(row.id as string, ref.version) : null;
    if (!version) throw problems([`class ${ref.name} ${ref.version} is not published; publish the class first (POST /api/dev/classes)`]);
    if (version.digest !== ref.digest) throw problems([`class ${ref.name} ${ref.version}: the component's descriptor has digest ${ref.digest}, the published class has ${version.digest}`]);
    publishedClass = version.descriptor;
    category = publishedClass.category;
    if (publishedClass.presentation === "visual" && c.images.length === 0) throw problems([`images: ${publishedClass.name} is a visual class, so at least one image of the component as built is required`]);
  } else category = (e as RecipeEntry).recipe.category;
  // A security release fixes a line that has a features release.
  if (e.release.channel === "security") {
    const entry = await d.entryBySlug(kind, splitName(name)!.slug);
    const line = versionLine(version);
    const features = entry ? (await d.versions(kind, entry.id, true)).some((v) => v.channel === "features" && versionLine(v.version) === line) : false;
    if (!features) throw problems([`release.channel security: ${name} has no published features release on line ${line}`]);
  }
  if (!(await d.categoryExists(category))) throw problems([`category ${category} is not in the category tree (classes/categories.json, POST /api/dev/categories)`]);
  await checkImages(d, e.images, dev.id);
  const c: Candidate = { kind, name, version, digest: e.digest, source: e.source, bundle: e.bundle };
  const plan = await prepare(env, d, deps, dev, c);
  const slug = splitName(name)!.slug;
  const now = deps.now().toISOString();
  const stored = plan.existing === "same" && kind === "component" ? await d.version("component", slug, version, true) : null;
  const before = stored ? await readDocument<ComponentEntry>(env, stored.row.document) : null;
  if (before && plan.entry && (before.format < e.format || textOnlyChange(before, e as ComponentEntry))) {
    // The same version and digest with an entry in a newer format, or with other text: its entry is replaced.
    await verifyRelease(env, deps, dev, c);
    const key = await putDocument(env, kind, slug, version, e);
    const x = e as ComponentEntry;
    await d.replaceComponentVersion(plan.entry, { version, digest: e.digest, channel: e.release.channel, fixes: e.release.fixes, images: e.images, waivers: e.vulnerabilityWaivers, quality: e.quality, source: e.source, bundle: e.bundle, document: key, listing: listingOf(kind, e, category, publishedClass), purls: purlsOf(e.foundations), description: x.description, guardians: x.guardians, suitability: x.suitability, classDigest: x.foundations.implements[0]!.digest, provides: x.provides, requires: x.requires, dependencies: x.dependencies }, now);
    if (plan.unlisted) await d.relist(kind, plan.entry, version, now);
    await d.claimImages(e.images.flatMap((i) => [hexOf(i.digest), hexOf(i.thumbnail)]), now);
    await audit(request, env, deps, dev.id, "component-updated", `${name} ${version}`);
    return published(env, kind, "updated", name, slug, version);
  }
  if (plan.existing === "same") {
    if (!plan.unlisted) return published(env, kind, "unchanged", name, slug, version);
    await verifyRelease(env, deps, dev, c);
    await d.relist(kind, plan.entry!, version, now);
  } else {
    await verifyRelease(env, deps, dev, c);
    const key = await putDocument(env, kind, slug, version, e);
    const listing = listingOf(kind, e, category, publishedClass);
    const base = { version, digest: e.digest, channel: e.release.channel, fixes: e.release.fixes, images: e.images, waivers: e.vulnerabilityWaivers, quality: e.quality, source: e.source, bundle: e.bundle, document: key, listing, purls: purlsOf(e.foundations) };
    if (kind === "component") {
      const x = e as ComponentEntry;
      await d.publish("component", plan.entry, plan.fresh, { ...base, description: x.description, guardians: x.guardians, suitability: x.suitability, classDigest: x.foundations.implements[0]!.digest, provides: x.provides, requires: x.requires, dependencies: x.dependencies }, now);
    } else {
      const x = e as RecipeEntry;
      await d.publish("recipe", plan.entry, plan.fresh, { ...base, recipe: x.recipe, hasDiagram: Boolean(x.page.diagram) }, now);
    }
  }
  await d.claimImages(e.images.flatMap((i) => [hexOf(i.digest), hexOf(i.thumbnail)]), now);
  if (kind === "recipe") await applyReports(d, slug, name, version);
  await audit(request, env, deps, dev.id, `${kind}-published`, `${name} ${version}`);
  return published(env, kind, "published", name, slug, version);
}

// POST /api/dev/recipes
export async function publishRecipe(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  const body = await readJson<unknown>(request);
  const result = validateRecipeEntry(body, await catalogueContext(env, db(env), body));
  if (!result.ok) throw problems(result.errors);
  return publishEntry(request, env, deps, dev, "recipe", result.entry, body);
}

// POST /api/dev/components
export async function publishComponent(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  const body = await readJson<unknown>(request);
  const result = validateComponentEntry(body);
  if (!result.ok) throw problems(result.errors);
  return publishEntry(request, env, deps, dev, "component", result.entry, body);
}

// POST /api/dev/{recipes,components}/:name/:version/quality: a curator records a level reached after publishing.
export async function setQuality(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, kind: Kind, name: string, version: string): Promise<Response> {
  if (!curator(env, dev)) throw new HttpError(403, "only the catalogue's publish tool sets quality");
  const result = validateQuality(await readJson<unknown>(request));
  if (!result.ok) throw problems(result.errors);
  const d = db(env);
  const f = await found(env, d, kind, name, versionOf(version));
  await d.setQuality(kind, f.entry, f.row.version, result.quality);
  await audit(request, env, deps, dev.id, `${kind}-quality`, `${f.entry.name} ${f.row.version} ${result.quality.level}${result.quality.certified ? " certified" : ""}`);
  return json({ name: f.entry.name, version: f.row.version, quality: result.quality satisfies Quality });
}

// POST /api/dev/classes with { format: 2, class: <class.json> }
export async function publishClass(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  const body = await readJson<unknown>(request);
  const result = validateClassEntry(body);
  if (!result.ok) throw problems(result.errors);
  refuseSecrets(body);
  const c = result.entry.class;
  const d = db(env);
  if (!(await d.categoryExists(c.category))) throw problems([`class.category ${c.category} is not in the category tree (classes/categories.json, POST /api/dev/categories)`]);
  const { namespace, slug } = splitName(c.name)!;
  await namespacePublisher(env, deps, dev, namespace);
  const existing = await d.classByName(c.name);
  const bySlug = existing ?? (await d.classBySlug(slug));
  if (bySlug && bySlug.name !== c.name) throw new HttpError(409, `the name ${slug} is already published as ${bySlug.name}`);
  if (existing && existing.developer_id !== dev.id) throw new HttpError(409, "that class belongs to another developer");
  const url = { status: "published", name: c.name, version: c.version, digest: `sha256:${result.entry.digest}`, url: `${env.PUBLIC_ORIGIN}/classes/${slug}`, api: `${env.PUBLIC_ORIGIN}/api/classes/${slug}/${c.version}` };
  if (existing) {
    const known = await d.classVersion(existing.id as string, c.version);
    if (known) {
      if (known.digest !== result.entry.digest) throw new HttpError(409, `class version ${c.version} is already published with a different digest; publish a new version`);
      return json({ ...url, status: "unchanged" });
    }
  } else if (!curator(env, dev) && ((await env.DB.prepare("SELECT COUNT(*) AS n FROM classes WHERE developer_id = ?").bind(dev.id).first<{ n: number }>())?.n ?? 0) >= MAX_CLASSES_PER_DEVELOPER) {
    throw new HttpError(409, `a developer can publish at most ${MAX_CLASSES_PER_DEVELOPER} classes`);
  }
  await d.publishClass(existing, { id: randomId(8), name: c.name, namespace, slug, developerId: dev.id }, c, result.entry.digest, deps.now().toISOString());
  await audit(request, env, deps, dev.id, "class-published", `${c.name} ${c.version}`);
  return json(url, 201);
}

// The GitHub owner of a namespace, once the developer is that owner or an active member of it; 403 otherwise.
async function namespacePublisher(env: Env, deps: Deps, dev: AuthedDeveloper, namespace: string): Promise<string> {
  const owner = namespaceOwner(namespace, env.NAMESPACE_OWNERS);
  if (owner === null) throw new HttpError(403, `the namespace ${namespace} has no owner on ClodHub: publish in io.github.<your GitHub login or organisation>, or ask for ${namespace} to be assigned to a GitHub owner`);
  if (owner === dev.githubLogin.toLowerCase() || (await memberOf(env, deps, dev, owner))) return owner;
  throw new HttpError(403, `publish in ${namespace} as ${owner} or as an active member of the ${owner} organisation on GitHub; a member of an organisation that restricts third-party apps grants ClodHub access to it (GitHub Settings, Applications, Authorized OAuth Apps, ClodHub, Grant) and signs in to clodhub.com again`);
}

// Whether the developer is an active member of the organisation: by the memberships read at their last sign-in, or
// else by their saved GitHub token. A token GitHub refuses for lack of the read:org scope gets 403 with what to do.
export const NO_GITHUB_TOKEN = "there is no saved GitHub token and no organisation list from sign-in; sign in to clodhub.com again";
export const ORG_SCOPE_MISSING = "the saved GitHub token cannot read organisation membership; sign in to clodhub.com again";
async function memberOf(env: Env, deps: Deps, dev: AuthedDeveloper, org: string): Promise<boolean> {
  const recorded = await env.DB.prepare("SELECT orgs FROM developer_orgs WHERE developer_id = ?").bind(dev.id).first<{ orgs: string }>();
  if (recorded && (JSON.parse(recorded.orgs) as string[]).includes(org.toLowerCase())) return true;
  const token = (await loadSecrets(env, dev.id, ["githubToken"])).githubToken;
  if (!token) {
    if (recorded) return false;
    throw new HttpError(403, NO_GITHUB_TOKEN);
  }
  let res: Response;
  try {
    res = await fetchUpstream(env, deps, `${env.GITHUB_API_BASE}/user/memberships/orgs/${encodeURIComponent(org)}`, token, "application/vnd.github+json");
  } catch {
    throw new HttpError(502, "GitHub could not be reached");
  }
  if (res.status === 403 || res.status === 401) throw new HttpError(403, ORG_SCOPE_MISSING);
  if (res.status === 404) return false;
  if (!res.ok) throw new HttpError(502, `GitHub answered ${res.status} for your membership of ${org}`);
  return ((await res.json().catch(() => ({}))) as { state?: string }).state === "active";
}

// POST /api/dev/categories with classes/categories.json. A curator adds categories; existing ones keep their place and
// take the new title. A category is never removed.
export async function publishCategories(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  if (!curator(env, dev)) throw new HttpError(403, "only the catalogue's curators publish the category tree");
  const result = validateCategories(await readJson<unknown>(request));
  if (!result.ok) throw problems(result.errors);
  const ids = new Set(result.categories.map((c) => c.id));
  const d = db(env);
  const existing = await d.categoriesByIds([...ids]);
  for (const c of result.categories) if (c.parent && !ids.has(c.parent) && !(await d.categoryExists(c.parent))) throw problems([`category ${c.id}: its parent ${c.parent} is not in the tree`]);
  const added = result.categories.filter((c) => !existing.has(c.id));
  await d.addCategories(added);
  const renamed = result.categories.filter((c) => existing.has(c.id) && existing.get(c.id)!.title !== c.title);
  for (const c of renamed) await env.DB.prepare("UPDATE categories SET title = ? WHERE id = ?").bind(c.title, c.id).run();
  await audit(request, env, deps, dev.id, "categories-published", `${added.length} added, ${renamed.length} renamed`);
  return json({ status: "published", added: added.map((c) => c.id), renamed: renamed.map((c) => c.id), total: (await d.categories()).length });
}

// GET /api/dev/recipes and /api/dev/components: the developer's own, unlisted versions included.
export async function listMine(env: Env, dev: AuthedDeveloper, kind: Kind): Promise<Response> {
  const d = db(env);
  const entries = await Promise.all(
    (await d.entriesByDeveloper(kind, dev.id)).map(async (e) => ({
      name: e.name,
      slug: e.slug,
      repository: e.repo,
      latestVersion: e.latestVersion,
      status: entryStatus(e.developerId, e.flag),
      deprecated: e.flag ? { since: e.flag.at, reason: e.flag.reason, replacement: e.flag.replacement } : null,
      versions: (await d.versions(kind, e.id, true)).map((v) => ({ version: v.version, digest: v.digest, publishedAt: v.publishedAt, channel: v.channel, fixes: v.fixes, listed: v.unlistedAt === null })),
    })),
  );
  return json(kind === "recipe" ? { recipes: entries } : { components: entries });
}

// DELETE /api/dev/recipes/:name[/:version] and /api/dev/components/:name[/:version]
export async function unlist(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, kind: Kind, name: string, version: string | null): Promise<Response> {
  const d = db(env);
  if (!isCatalogueSlug(name) || (version !== null && !isPackageVersion(version))) throw new HttpError(404, "not found");
  const entry = await d.entryBySlug(kind, name);
  if (!entry || entry.developerId !== dev.id) throw new HttpError(404, "not found");
  if (version !== null && !(await d.versions(kind, entry.id, true)).some((v) => v.version === version)) throw new HttpError(404, "not found");
  const unlisted = await d.unlist(kind, entry, version, deps.now().toISOString());
  await audit(request, env, deps, dev.id, `${kind}-unlisted`, `${entry.name}${version ? ` ${version}` : ""}`);
  return json({ ok: true, unlisted });
}

// POST /api/dev/recipes/:name/deprecate|undeprecate and the same for components. Body for deprecate: optional { replacement }.
export async function setDeprecation(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, kind: Kind, name: string, deprecate: boolean): Promise<Response> {
  const d = db(env);
  if (!isCatalogueSlug(name)) throw new HttpError(404, "not found");
  const entry = await d.entryBySlug(kind, name);
  if (!entry || entry.developerId !== dev.id) throw new HttpError(404, "not found");
  const body = deprecate ? await optionalJson(request) : {};
  let replacement: string | null = null;
  if (deprecate && body.replacement !== undefined && body.replacement !== null) {
    if (!isCatalogueName(body.replacement, kind)) throw new HttpError(400, `replacement must be ${nameRule(kind)}`);
    if (body.replacement === entry.name) throw new HttpError(400, "an entry cannot replace itself");
    const target = await d.entryBySlug(kind, splitName(body.replacement)!.slug);
    if (!target || target.name !== body.replacement) throw new HttpError(400, `replacement must be a published ${kind} name`);
    replacement = body.replacement;
  }
  if (deprecate) await d.deprecate(kind, entry.id, replacement, deps.now().toISOString());
  else await d.undeprecate(kind, entry.id);
  await audit(request, env, deps, dev.id, `${kind}-${deprecate ? "deprecated" : "undeprecated"}`, `${entry.name}${replacement ? ` -> ${replacement}` : ""}`);
  const after = (await d.entryBySlug(kind, name))!;
  return json({ ok: true, name: after.name, status: entryStatus(after.developerId, after.flag), deprecated: after.flag ? { since: after.flag.at, reason: after.flag.reason, replacement: after.flag.replacement } : null });
}

// An absent body means no fields; anything else must be a JSON object.
async function optionalJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "body must be JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new HttpError(400, "body must be a JSON object");
  return parsed as Record<string, unknown>;
}
