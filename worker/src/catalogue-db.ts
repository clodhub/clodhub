// D1 access for the recipe library, the component catalogue, classes and categories. Entry rows are the listing:
// each holds the summary of its newest listed version. Full version entries are R2 documents (catalogue-store.ts).
import { COUNT_CAP, QUALITY_LEVELS, compareVersions, newestVersion, type Channel, type ComponentDependency, type Deprecation, type DeprecationReason, type EntryStatus, type ListQuery, type Quality, type Recipe, type Suitability, type Targets, type VulnerabilityWaiver, type AppTarget, type DeprecatedFilter, type PackageImage, type ClassDescriptor, type CategoryNode } from "@my/store-shared";

export type Kind = "recipe" | "component";

const MAX_TREE_DEPTH = 8;

export const TABLES = {
  recipe: { entries: "recipes", versions: "recipe_versions", fk: "recipe_id", fts: "recipe_fts", vocab: "recipe_vocab", count: "recipes" },
  component: { entries: "components", versions: "component_versions", fk: "component_id", fts: "component_fts", vocab: "component_vocab", count: "components" },
} as const;

type Raw = Record<string, unknown>;

function parse<T>(value: unknown, fallback: T): T {
  try {
    return typeof value === "string" ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

// The flag on a name; it covers every version.
export interface Flag {
  at: string;
  reason: DeprecationReason;
  replacement: string | null;
}

export interface EntryRow {
  seq: number;
  id: string;
  name: string;
  scope: string;
  slug: string;
  // Null once the developer deleted the account.
  developerId: string | null;
  repo: string;
  latestVersion: string | null;
  flag: Flag | null;
  createdAt: string;
  updatedAt: string;
}

function flagOf(r: Raw): Flag | null {
  return r.deprecated_at ? { at: r.deprecated_at as string, reason: r.deprecated_reason as DeprecationReason, replacement: (r.replacement as string | null) ?? null } : null;
}

function entryRow(r: Raw): EntryRow {
  return { seq: r.seq as number, id: r.id as string, name: r.name as string, scope: r.scope as string, slug: r.slug as string, developerId: (r.developer_id as string | null) ?? null, repo: r.repo as string, latestVersion: (r.latest_version as string | null) ?? null, flag: flagOf(r), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
}

export function entryStatus(developerId: string | null, flag: Flag | null): EntryStatus {
  return flag === null ? "active" : developerId === null ? "orphaned" : "deprecated";
}

export function noticeFor(name: string, version: string, developerId: string | null, flag: Flag, via: string[]): Deprecation {
  const notice: Deprecation = { name, version, status: developerId === null ? "orphaned" : "deprecated", reason: flag.reason, since: flag.at, via };
  if (flag.replacement) notice.replacement = flag.replacement;
  return notice;
}

export const qualityNumber = (q: Quality | null): number | null => (q ? QUALITY_LEVELS.indexOf(q.level) : null);

export function qualityOf(level: unknown, certified: unknown, at: unknown, platform: unknown): Quality | null {
  if (typeof level !== "number") return null;
  return { level: QUALITY_LEVELS[level]!, certified: certified === 1, liveTested: typeof at === "string" ? { at, platform: String(platform) } : null };
}

// What an entry row shows while a version is its newest listed one; stored with the version as `listing`.
export interface Listing {
  description: string;
  title: string;
  summary: string;
  category: string;
  className: string | null;
  classVersion: string | null;
  classTitle: string | null;
  platforms: string[];
  targets: Targets;
  tags: string[];
  licence: string;
  thumbnail: string | null;
}

// An entry's listing row: the entry, the summary of its newest listed version and the publisher.
export interface SummaryRow extends EntryRow, Listing {
  quality: Quality | null;
  channel: Channel;
  vulnerabilities: number | null;
  publishedAt: string;
  downloads: number;
  trending: number;
  publisherSlug: string | null;
  publisherName: string | null;
}

function summaryRow(r: Raw): SummaryRow {
  return {
    ...entryRow(r),
    description: (r.description as string | undefined) ?? "",
    title: (r.title as string | undefined) ?? "",
    summary: (r.summary as string | undefined) ?? "",
    category: (r.category as string | null) ?? "",
    className: (r.class_name as string | null | undefined) ?? null,
    classVersion: (r.class_version as string | null | undefined) ?? null,
    classTitle: (r.class_title as string | null | undefined) ?? null,
    platforms: String(r.platforms ?? "").trim().split(" ").filter(Boolean),
    targets: { client: parse<AppTarget[]>(r.targets_client, []), server: parse<string[]>(r.targets_server, []) },
    tags: String(r.tags ?? "").split(" ").filter(Boolean),
    licence: (r.licence as string | null) ?? "",
    thumbnail: (r.thumbnail as string | null) ?? null,
    quality: qualityOf(r.quality, r.certified, r.live_tested_at, r.live_tested_platform),
    channel: ((r.channel as Channel | null) ?? "features"),
    vulnerabilities: (r.vulnerabilities as number | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? "",
    downloads: (r.downloads as number | null) ?? 0,
    trending: (r.trending as number | null) ?? 0,
    publisherSlug: (r.publisher_slug as string | null) ?? null,
    publisherName: (r.publisher_name as string | null) ?? null,
  };
}

// One version row: what pages and checks read without the R2 document.
export interface VersionRow {
  entryId: string;
  version: string;
  digest: string;
  channel: Channel;
  fixes: string[];
  images: PackageImage[];
  waivers: VulnerabilityWaiver[];
  quality: Quality | null;
  vulnerabilities: number | null;
  vulnerabilitiesCheckedAt: string | null;
  downloads: number;
  sourceRepo: string;
  sourceTag: string;
  bundleAsset: string;
  bundleDigest: string;
  document: string;
  listing: Listing;
  publishedAt: string;
  unlistedAt: string | null;
  // components
  description: string;
  guardians: string[];
  suitability: Suitability | null;
  classDigest: string | null;
  // recipes
  hasDiagram: boolean;
}

function versionRow(kind: Kind, r: Raw): VersionRow {
  return {
    entryId: r[TABLES[kind].fk] as string,
    version: r.version as string,
    digest: r.digest as string,
    channel: r.channel as Channel,
    fixes: parse<string[]>(r.fixes, []),
    images: parse<PackageImage[]>(r.images, []),
    waivers: parse<VulnerabilityWaiver[]>(r.waivers, []),
    quality: qualityOf(r.quality, r.certified, r.live_tested_at, r.live_tested_platform),
    vulnerabilities: (r.vulnerabilities as number | null) ?? null,
    vulnerabilitiesCheckedAt: (r.vulnerabilities_checked_at as string | null) ?? null,
    downloads: (r.downloads as number | null) ?? 0,
    sourceRepo: r.source_repo as string,
    sourceTag: r.source_tag as string,
    bundleAsset: r.bundle_asset as string,
    bundleDigest: r.bundle_digest as string,
    document: r.document as string,
    listing: parse<Listing>(r.listing, null as unknown as Listing),
    publishedAt: r.published_at as string,
    unlistedAt: (r.unlisted_at as string | null) ?? null,
    description: (r.description as string | undefined) ?? "",
    guardians: parse<string[]>(r.guardians, []),
    suitability: parse<Suitability | null>(r.suitability, null),
    classDigest: (r.class_digest as string | undefined) ?? null,
    hasDiagram: r.has_diagram === 1,
  };
}

// A version to record, with what its rows need beyond the R2 document.
export interface NewVersion {
  version: string;
  digest: string;
  channel: Channel;
  fixes: string[];
  images: PackageImage[];
  waivers: VulnerabilityWaiver[];
  quality: Quality | null;
  source: { repository: string; tag: string };
  bundle: { asset: string; digest: string };
  document: string;
  listing: Listing;
  purls: string[];
  // component
  description?: string;
  guardians?: string[];
  suitability?: Suitability;
  classDigest?: string;
  provides?: { id: string; type: string; version: string }[];
  requires?: { id: string; type: string; version: string }[];
  dependencies?: ComponentDependency[];
  // recipe
  recipe?: Recipe;
  hasDiagram?: boolean;
}

const SUMMARY_COLUMNS = `e.*, d.slug AS publisher_slug, d.display_name AS publisher_name`;
const VERSION_ENTRY = (t: { entries: string; versions: string; fk: string }) => `${t.versions} v JOIN ${t.entries} e ON e.id = v.${t.fk}`;

// The words of a search, lowercased: at most 8 of at most 40 characters.
export function searchWords(input: string): string[] {
  return (input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8).map((w) => w.slice(0, 40));
}

// Characters that FTS5 treats as syntax never reach it: every word is quoted. Words of 3 or more characters also
// match as prefixes; shorter ones match whole words only.
export const PREFIX_MIN = 3;
export function ftsQuery(input: string): string | null {
  const words = searchWords(input);
  return words.length === 0 ? null : words.map((w) => (w.length >= PREFIX_MIN ? `"${w}"*` : `"${w}"`)).join(" ");
}

// A category and its ancestors, outermost first.
export function ancestors(category: string | null): string[] {
  if (!category) return [];
  const parts = category.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

// The keyset of a listing page: the sort value and seq of a row, and which way to read.
interface Cursor {
  value: string | number;
  seq: number;
  back: boolean;
}

export function encodeCursor(c: Cursor): string {
  return btoa(JSON.stringify([c.value, c.seq, c.back ? 1 : 0])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(s: string): Cursor | null {
  try {
    const [value, seq, back] = JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/"))) as [unknown, unknown, unknown];
    if ((typeof value !== "string" && typeof value !== "number") || !Number.isSafeInteger(seq)) return null;
    return { value, seq: seq as number, back: back === 1 };
  } catch {
    return null;
  }
}

// How long a filtered listing total is kept.
export const TOTALS_SECONDS = 600;
// The most filtered totals kept.
export const TOTALS_KEPT = 100_000;

// The filters of a listing, without its sort and page, as the key of its kept total.
function totalsKey(kind: Kind, q: ListQuery, publisherId: string | null): string {
  const { sort: _s, cursor: _c, limit: _l, publisher: _p, ...filters } = q;
  return `${kind}:${JSON.stringify(filters, Object.keys(filters).sort())}:${publisherId ?? ""}`;
}

export interface OsvVersion {
  kind: Kind;
  entryId: string;
  version: string;
  alone: boolean;
  runs: number;
  due: string;
}

export const osvKey = (v: { kind: Kind; entryId: string; version: string }) => `${v.kind} ${v.entryId} ${v.version}`;

// Entries one download refresh statement covers, and the chunks one run may do: each chunk is four of the 1,000 D1
// queries a Worker invocation may make.
export const DOWNLOAD_CHUNK = 1_000;
export const DOWNLOAD_CHUNKS_PER_RUN = 150;

// A class, provides or requires filter with at most this many matching entries reads only those entries.
export const SET_LIMIT = 20_000;

// The most index rows one listing query examines.
export const SCAN_BUDGET = 20_000;
// A search with at most this many full-text matches orders all of them.
export const SEARCH_ALL = 1_000;
// The most downloaded matches a relevance search over more matches ranks.
export const SEARCH_CANDIDATES = 1_000;
// Above this many matches a search looks each listed row up in the full-text index, over at most SEARCH_SCAN_BUDGET
// rows, with a prefix written out as at most SEARCH_TERMS terms.
export const SEARCH_DENSE = 20_000;
export const SEARCH_SCAN_BUDGET = 5_000;
export const SEARCH_TERMS = 16;

const SORT_COLUMN = { downloads: "downloads", trending: "trending", updated: "published_at", name: "name" } as const;
const SORT_INDEX = { downloads: "downloads", trending: "trending", updated: "updated", name: "name" } as const;

export interface ListPage {
  rows: SummaryRow[];
  total: { count: number; approximate: boolean };
  next: string | null;
  previous: string | null;
}

export class CatalogueDb {
  // D1's rows read for every query this object ran, for the Server-Timing header.
  rowsRead = 0;
  queries = 0;

  constructor(private d1: D1Database) {}

  private note(meta: { rows_read?: number } | undefined): void {
    this.queries += 1;
    this.rowsRead += meta?.rows_read ?? 0;
  }

  private async all<T = Raw>(statement: D1PreparedStatement): Promise<T[]> {
    const res = await statement.all<T>();
    this.note(res.meta as { rows_read?: number });
    return res.results;
  }

  private async first<T = Raw>(statement: D1PreparedStatement): Promise<T | null> {
    const rows = await this.all<T>(statement);
    return rows[0] ?? null;
  }

  private async batch<T = Raw>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (statements.length === 0) return [];
    const results = await this.d1.batch<T>(statements);
    for (const r of results) this.note(r.meta as { rows_read?: number });
    return results;
  }

  // ---------------------------------------------------------------- entries

  async entryBySlug(kind: Kind, slug: string): Promise<EntryRow | null> {
    const r = await this.first(this.d1.prepare(`SELECT seq, id, name, scope, slug, developer_id, repo, latest_version, deprecated_at, deprecated_reason, replacement, created_at, updated_at FROM ${TABLES[kind].entries} WHERE slug = ?`).bind(slug));
    return r ? entryRow(r) : null;
  }

  async summaryBySlug(kind: Kind, slug: string): Promise<SummaryRow | null> {
    const r = await this.first(this.d1.prepare(`SELECT ${SUMMARY_COLUMNS} FROM ${TABLES[kind].entries} e LEFT JOIN developers d ON d.id = e.developer_id WHERE e.slug = ?`).bind(slug));
    return r ? summaryRow(r) : null;
  }

  async entriesByDeveloper(kind: Kind, developerId: string): Promise<EntryRow[]> {
    return (await this.all(this.d1.prepare(`SELECT * FROM ${TABLES[kind].entries} WHERE developer_id = ? ORDER BY name`).bind(developerId))).map(entryRow);
  }

  async countByDeveloper(kind: Kind, developerId: string): Promise<number> {
    return (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM ${TABLES[kind].entries} WHERE developer_id = ?`).bind(developerId)))?.n ?? 0;
  }

  async countVersions(kind: Kind, entryId: string): Promise<number> {
    const t = TABLES[kind];
    return (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM ${t.versions} WHERE ${t.fk} = ?`).bind(entryId)))?.n ?? 0;
  }

  // Versions of one entry, newest first. Unlisted versions are included only when asked.
  async versions(kind: Kind, entryId: string, includeUnlisted = false): Promise<{ version: string; digest: string; publishedAt: string; channel: Channel; fixes: string[]; unlistedAt: string | null }[]> {
    const t = TABLES[kind];
    const rows = await this.all(this.d1.prepare(`SELECT version, digest, published_at, unlisted_at, channel, fixes FROM ${t.versions} WHERE ${t.fk} = ?${includeUnlisted ? "" : " AND unlisted_at IS NULL"}`).bind(entryId));
    return rows
      .map((r) => ({ version: r.version as string, digest: r.digest as string, publishedAt: r.published_at as string, channel: r.channel as Channel, fixes: parse<string[]>(r.fixes, []), unlistedAt: (r.unlisted_at as string | null) ?? null }))
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  async version(kind: Kind, slug: string, version: string, includeUnlisted = false): Promise<{ entry: SummaryRow; row: VersionRow } | null> {
    const entry = await this.summaryBySlug(kind, slug);
    if (!entry) return null;
    const wanted = version === "latest" ? entry.latestVersion : version;
    if (!wanted) return null;
    const t = TABLES[kind];
    const r = await this.first(this.d1.prepare(`SELECT * FROM ${t.versions} WHERE ${t.fk} = ? AND version = ?${includeUnlisted ? "" : " AND unlisted_at IS NULL"}`).bind(entry.id, wanted));
    return r ? { entry, row: versionRow(kind, r) } : null;
  }

  // ---------------------------------------------------------------- publishing

  // Records a version, then refreshes the entry's summary, search row and category counts.
  async publish(kind: Kind, entry: EntryRow | null, fresh: EntryRow, v: NewVersion, now: string): Promise<void> {
    const t = TABLES[kind];
    const target = entry ?? fresh;
    const statements: D1PreparedStatement[] = [];
    if (!entry) statements.push(this.d1.prepare(`INSERT INTO ${t.entries} (id, name, scope, slug, developer_id, repo, latest_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`).bind(fresh.id, fresh.name, fresh.scope, fresh.slug, fresh.developerId, fresh.repo, fresh.createdAt, fresh.updatedAt));
    const q = v.quality;
    const common = [v.version, v.digest, v.listing.licence, ` ${v.listing.platforms.join(" ")} `, v.channel, JSON.stringify(v.fixes), JSON.stringify(v.images), JSON.stringify(v.waivers), qualityNumber(q), q?.certified ? 1 : 0, q?.liveTested?.at ?? null, q?.liveTested?.platform ?? null, v.purls.length === 0 ? 0 : null, v.purls.length === 0 ? now : null, v.source.repository, v.source.tag, v.bundle.asset, v.bundle.digest, v.document, JSON.stringify(v.listing), now];
    const commonColumns = "version, digest, licence, platforms, channel, fixes, images, waivers, quality, certified, live_tested_at, live_tested_platform, vulnerabilities, vulnerabilities_checked_at, source_repo, source_tag, bundle_asset, bundle_digest, document, listing, published_at";
    const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");
    if (kind === "component") {
      statements.push(this.d1.prepare(`INSERT INTO component_versions (component_id, description, guardians, suitability, class_name, class_version, class_digest, ${commonColumns}) VALUES (${marks(7 + common.length)})`).bind(target.id, v.description!, JSON.stringify(v.guardians ?? []), JSON.stringify(v.suitability), v.listing.className, v.listing.classVersion, v.classDigest!, ...common));
      for (const [direction, ports] of [["provides", v.provides ?? []], ["requires", v.requires ?? []]] as const) {
        for (const p of ports) statements.push(this.d1.prepare("INSERT INTO component_interfaces (component_id, version, direction, port_id, type, interface_version) VALUES (?, ?, ?, ?, ?, ?)").bind(target.id, v.version, direction, p.id, p.type, p.version));
      }
      for (const dep of v.dependencies ?? []) statements.push(this.d1.prepare("INSERT INTO component_dependencies (component_id, version, dependency_name, dependency_version) VALUES (?, ?, ?, ?)").bind(target.id, v.version, dep.name, dep.version));
    } else {
      statements.push(this.d1.prepare(`INSERT INTO recipe_versions (recipe_id, title, summary, has_diagram, ${commonColumns}) VALUES (${marks(4 + common.length)})`).bind(target.id, v.listing.title, v.listing.summary, v.hasDiagram ? 1 : 0, ...common));
      for (const ref of slotComponents(v.recipe!)) statements.push(this.d1.prepare("INSERT INTO recipe_slots (recipe_id, version, slot_id, component_name, component_version, preferred, included_when) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(target.id, v.version, ref.slot, ref.name, ref.version, ref.preferred ? 1 : 0, ref.includedWhen));
    }
    statements.push(this.d1.prepare("INSERT OR IGNORE INTO published_digests (kind, name, version, digest, published_at) VALUES (?, ?, ?, ?, ?)").bind(kind, target.name, v.version, v.digest, now));
    for (const purl of v.purls) {
      statements.push(this.d1.prepare("INSERT OR IGNORE INTO purls (purl) VALUES (?)").bind(purl));
      statements.push(this.d1.prepare("INSERT OR IGNORE INTO version_purls (kind, entry_id, version, purl) VALUES (?, ?, ?, ?)").bind(kind, target.id, v.version, purl));
    }
    // A version whose purls were all checked already takes their advisories now; the hourly check looks at it next.
    if (v.purls.length > 0) {
      statements.push(this.d1.prepare(`UPDATE ${t.versions} SET osv_due = ? WHERE ${t.fk} = ? AND version = ?`).bind(now, target.id, v.version));
      const t2 = TABLES[kind];
      statements.push(
        this.d1
          .prepare(
            `UPDATE ${t2.versions} SET
               vulnerabilities = CASE WHEN EXISTS (SELECT 1 FROM version_purls vp JOIN purls p ON p.purl = vp.purl WHERE vp.kind = ?1 AND vp.entry_id = ?2 AND vp.version = ?3 AND (p.unqueryable = 1 OR vp.unresolved = 1)) THEN NULL ELSE (SELECT COUNT(DISTINCT a.value) FROM version_purls vp JOIN purls p ON p.purl = vp.purl, json_each(p.advisories) a
                 WHERE vp.kind = ?1 AND vp.entry_id = ?2 AND vp.version = ?3 AND a.value NOT IN (SELECT json_extract(w.value, '$.id') FROM json_each(${t2.versions}.waivers) w)) END,
               vulnerabilities_checked_at = (SELECT MIN(p.checked_at) FROM version_purls vp JOIN purls p ON p.purl = vp.purl WHERE vp.kind = ?1 AND vp.entry_id = ?2 AND vp.version = ?3)
             WHERE ${t2.fk} = ?2 AND version = ?3 AND NOT EXISTS (SELECT 1 FROM version_purls vp JOIN purls p ON p.purl = vp.purl WHERE vp.kind = ?1 AND vp.entry_id = ?2 AND vp.version = ?3 AND p.checked_at IS NULL)`,
          )
          .bind(kind, target.id, v.version),
      );
    }
    statements.push(...(await this.refreshStatements(kind, entry, target, now, { version: v.version, channel: v.channel, listing: v.listing })));
    await this.batch(statements);
  }

  // Replaces what a component version's entry says, keeping its digest, downloads, vulnerability results and publication
  // date: a version stored in an earlier entry format published again. Its quality stays unless the new entry sets one.
  async replaceComponentVersion(entry: EntryRow, v: NewVersion, now: string): Promise<void> {
    const q = v.quality;
    const statements: D1PreparedStatement[] = [
      this.d1
        .prepare(
          `UPDATE component_versions SET description = ?, guardians = ?, suitability = ?, class_name = ?, class_version = ?, class_digest = ?, licence = ?, platforms = ?, channel = ?, fixes = ?, images = ?, waivers = ?, source_repo = ?, source_tag = ?, bundle_asset = ?, bundle_digest = ?, document = ?, listing = ?${q ? ", quality = ?, certified = ?, live_tested_at = ?, live_tested_platform = ?" : ""} WHERE component_id = ? AND version = ? AND digest = ?`,
        )
        .bind(v.description!, JSON.stringify(v.guardians ?? []), JSON.stringify(v.suitability), v.listing.className, v.listing.classVersion, v.classDigest!, v.listing.licence, ` ${v.listing.platforms.join(" ")} `, v.channel, JSON.stringify(v.fixes), JSON.stringify(v.images), JSON.stringify(v.waivers), v.source.repository, v.source.tag, v.bundle.asset, v.bundle.digest, v.document, JSON.stringify(v.listing), ...(q ? [qualityNumber(q), q.certified ? 1 : 0, q.liveTested?.at ?? null, q.liveTested?.platform ?? null] : []), entry.id, v.version, v.digest),
      this.d1.prepare("DELETE FROM component_interfaces WHERE component_id = ? AND version = ?").bind(entry.id, v.version),
      this.d1.prepare("DELETE FROM component_dependencies WHERE component_id = ? AND version = ?").bind(entry.id, v.version),
    ];
    for (const [direction, ports] of [["provides", v.provides ?? []], ["requires", v.requires ?? []]] as const) {
      for (const p of ports) statements.push(this.d1.prepare("INSERT INTO component_interfaces (component_id, version, direction, port_id, type, interface_version) VALUES (?, ?, ?, ?, ?, ?)").bind(entry.id, v.version, direction, p.id, p.type, p.version));
    }
    for (const dep of v.dependencies ?? []) statements.push(this.d1.prepare("INSERT INTO component_dependencies (component_id, version, dependency_name, dependency_version) VALUES (?, ?, ?, ?)").bind(entry.id, v.version, dep.name, dep.version));
    statements.push(...(await this.refreshStatements("component", entry, entry, now, { version: v.version, channel: v.channel, listing: v.listing })));
    await this.batch(statements);
  }

  // Lists a version again after it was unlisted.
  async relist(kind: Kind, entry: EntryRow, version: string, now: string): Promise<void> {
    const t = TABLES[kind];
    await this.batch([this.d1.prepare(`UPDATE ${t.versions} SET unlisted_at = NULL WHERE ${t.fk} = ? AND version = ?`).bind(entry.id, version), ...(await this.refreshStatements(kind, entry, entry, now, undefined, version))]);
  }

  // Hides one version, or every version when none is named. Rows stay so a version keeps its digest.
  async unlist(kind: Kind, entry: EntryRow, version: string | null, now: string): Promise<number> {
    const t = TABLES[kind];
    const update = version
      ? this.d1.prepare(`UPDATE ${t.versions} SET unlisted_at = ? WHERE ${t.fk} = ? AND version = ? AND unlisted_at IS NULL`).bind(now, entry.id, version)
      : this.d1.prepare(`UPDATE ${t.versions} SET unlisted_at = ? WHERE ${t.fk} = ? AND unlisted_at IS NULL`).bind(now, entry.id);
    const res = await update.run();
    this.note(res.meta as { rows_read?: number });
    await this.batch(await this.refreshStatements(kind, entry, entry, now));
    return res.meta.changes ?? 0;
  }

  // ---------------------------------------------------------------- build reports

  // The digest a name's version was published with, now or before (null when never).
  async publishedDigest(kind: Kind, name: string, version: string): Promise<string | null> {
    return (await this.first<{ digest: string }>(this.d1.prepare("SELECT digest FROM published_digests WHERE kind = ? AND name = ? AND version = ?").bind(kind, name, version)))?.digest ?? null;
  }

  // Stores a report; false when the same report is stored already.
  async addBuildReport(r: { name: string; version: string; id: string; digest: string; date: string; report: string; by: string; now: string }): Promise<boolean> {
    const res = await this.d1.prepare("INSERT OR IGNORE INTO build_reports (recipe_name, version, id, digest, date, report, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(r.name, r.version, r.id, r.digest, r.date, r.report, r.by, r.now).run();
    this.note(res.meta as { rows_read?: number });
    return (res.meta.changes ?? 0) > 0;
  }

  // A recipe's reports, newest first (by the run's date, then by when they were sent).
  async buildReports(name: string, limit = 50): Promise<{ id: string; version: string; digest: string; date: string; report: string; publishedAt: string }[]> {
    const rows = await this.all(this.d1.prepare("SELECT id, version, digest, date, report, published_at FROM build_reports INDEXED BY build_reports_recent WHERE recipe_name = ? ORDER BY date DESC, published_at DESC LIMIT ?").bind(name, limit));
    return rows.map((r) => ({ id: r.id as string, version: r.version as string, digest: r.digest as string, date: r.date as string, report: r.report as string, publishedAt: r.published_at as string }));
  }

  // Sets the quality of one version and, when it is the newest listed one, of the entry row.
  async setQuality(kind: Kind, entry: EntryRow, version: string, q: Quality): Promise<void> {
    const t = TABLES[kind];
    const values = [qualityNumber(q), q.certified ? 1 : 0, q.liveTested?.at ?? null, q.liveTested?.platform ?? null];
    await this.batch([
      this.d1.prepare(`UPDATE ${t.versions} SET quality = ?, certified = ?, live_tested_at = ?, live_tested_platform = ? WHERE ${t.fk} = ? AND version = ?`).bind(...values, entry.id, version),
      this.d1.prepare(`UPDATE ${t.entries} SET quality = ?, certified = ? WHERE id = ? AND latest_version = ?`).bind(values[0], values[1], entry.id, version),
    ]);
  }

  // The newest listed version (a preview only when nothing else is listed), its summary on the entry row, the search
  // row, and the category and class counts. `adding` is a version inserted by the same batch; `relisting` one listed again.
  private async refreshStatements(kind: Kind, before: EntryRow | null, target: EntryRow, now: string, adding?: { version: string; channel: Channel; listing: Listing }, relisting?: string): Promise<D1PreparedStatement[]> {
    const t = TABLES[kind];
    const old = before ? await this.first(this.d1.prepare(`SELECT seq, category, ${kind === "component" ? "class_name" : "NULL AS class_name"}, latest_version FROM ${t.entries} WHERE id = ?`).bind(target.id)) : null;
    const listed = await this.all(this.d1.prepare(`SELECT version, channel, listing FROM ${t.versions} WHERE ${t.fk} = ? AND (unlisted_at IS NULL OR version = ?)`).bind(target.id, relisting ?? ""));
    const candidates = listed.filter((r) => r.version !== adding?.version).map((r) => ({ version: r.version as string, channel: r.channel as Channel, listing: parse<Listing>(r.listing, null as unknown as Listing) }));
    if (adding) candidates.push(adding);
    const stable = candidates.filter((c) => c.channel !== "preview");
    const pool = stable.length > 0 ? stable : candidates;
    const latestVersion = newestVersion(pool.map((c) => c.version));
    const latest = pool.find((c) => c.version === latestVersion) ?? null;
    const statements: D1PreparedStatement[] = [];
    const seqOf = `(SELECT seq FROM ${t.entries} WHERE id = ?)`;
    statements.push(this.d1.prepare(`DELETE FROM ${t.fts} WHERE rowid = ${seqOf}`).bind(target.id));
    if (latest) {
      const l = latest.listing;
      const versionFrom = `FROM ${t.versions} v WHERE v.${t.fk} = ${t.entries}.id AND v.version = ?`;
      statements.push(
        this.d1
          .prepare(
            `UPDATE ${t.entries} SET latest_version = ?, updated_at = ?, ${kind === "component" ? "description = ?, class_name = ?, class_version = ?, class_title = ?" : "title = ?, summary = ?"}, category = ?, category_top = ?, platforms = ?, targets_client = ?, targets_server = ?, tags = ?, licence = ?, thumbnail = ?,
               channel = (SELECT v.channel ${versionFrom}), quality = (SELECT v.quality ${versionFrom}), certified = (SELECT v.certified ${versionFrom}), vulnerabilities = (SELECT v.vulnerabilities ${versionFrom}), published_at = (SELECT v.published_at ${versionFrom})
             WHERE id = ?`,
          )
          .bind(latest.version, now, ...(kind === "component" ? [l.description, l.className, l.classVersion, l.classTitle] : [l.title, l.summary]), l.category, ancestors(l.category)[0] ?? null, ` ${l.platforms.join(" ")} `, JSON.stringify(l.targets.client), JSON.stringify(l.targets.server), l.tags.join(" "), l.licence, l.thumbnail, latest.version, latest.version, latest.version, latest.version, latest.version, target.id),
      );
      statements.push(this.d1.prepare(`INSERT INTO ${t.fts} (rowid, name, title, summary, class, tags) VALUES (${seqOf}, ?, ?, ?, ?, ?)`).bind(target.id, `${target.name} ${target.slug.replace(/-/g, " ")}`, kind === "component" ? (l.classTitle ?? "") : l.title, kind === "component" ? l.description : l.summary, l.className ? `${l.className} ${l.classTitle ?? ""}` : "", l.tags.join(" ")));
    } else {
      statements.push(this.d1.prepare(`UPDATE ${t.entries} SET latest_version = NULL, updated_at = ?, category = NULL, category_top = NULL${kind === "component" ? ", class_name = NULL" : ""} WHERE id = ?`).bind(now, target.id));
    }
    // Counts: an entry counts in its category and every ancestor while it has a listed version.
    const wasListed = Boolean(old?.latest_version);
    const oldCategory = wasListed ? ((old?.category as string | null) ?? null) : null;
    const newCategory = latest ? latest.listing.category : null;
    if (oldCategory !== newCategory) {
      for (const c of ancestors(oldCategory)) statements.push(this.d1.prepare(`UPDATE categories SET ${t.count} = ${t.count} - 1 WHERE id = ?`).bind(c));
      for (const c of ancestors(newCategory)) statements.push(this.d1.prepare(`UPDATE categories SET ${t.count} = ${t.count} + 1 WHERE id = ?`).bind(c));
    }
    if (kind === "component") {
      const oldClass = wasListed ? ((old?.class_name as string | null) ?? null) : null;
      const newClass = latest?.listing.className ?? null;
      if (oldClass !== newClass) {
        if (oldClass) statements.push(this.d1.prepare("UPDATE classes SET implementations = implementations - 1 WHERE name = ?").bind(oldClass));
        if (newClass) statements.push(this.d1.prepare("UPDATE classes SET implementations = implementations + 1 WHERE name = ?").bind(newClass));
      }
    }
    return statements;
  }

  // ---------------------------------------------------------------- listing

  // One page of a listing. One index drives each query: the class, category, licence or publisher index, or for the
  // default sort a facet's partial index, or the sort's own index. The other filters are checked on the rows the index
  // gives, and a page reads at most SCAN_BUDGET of them; a page that found fewer matches in that budget is short, and
  // its next cursor continues the scan.
  async list(kind: Kind, q: ListQuery, publisherId: string | null): Promise<ListPage> {
    const t = TABLES[kind];
    const where: string[] = ["e.latest_version IS NOT NULL"];
    const binds: (string | number)[] = [];
    const residual: string[] = [];
    const residualBinds: (string | number)[] = [];
    const sort = q.sort === "relevance" ? "downloads" : q.sort;
    let index: string = `${t.entries}_by_${SORT_INDEX[sort]}`;
    const used = new Set<string>();
    const leaf = q.category ? await this.isLeaf(q.category) : false;
    if (kind === "component" && q.class && sort === "downloads") {
      where.push("e.class_name = ?");
      binds.push(q.class);
      index = "components_class_downloads";
      used.add("class");
    } else if (q.category && !q.category.includes("/") && !leaf) {
      where.push("e.category_top = ?");
      binds.push(q.category);
      index = `${t.entries}_top_${SORT_INDEX[sort]}`;
      used.add("category");
    } else if (q.category && leaf) {
      where.push("e.category = ?");
      binds.push(q.category);
      index = `${t.entries}_category_${SORT_INDEX[sort]}`;
      used.add("category");
    } else if (q.licence && sort === "downloads") {
      where.push("e.licence = ?");
      binds.push(q.licence);
      index = `${t.entries}_licence_downloads`;
      used.add("licence");
    } else if (publisherId && sort === "downloads") {
      where.push("e.developer_id = ?");
      binds.push(publisherId);
      index = `${t.entries}_publisher_downloads`;
      used.add("publisher");
    } else if (sort === "downloads") {
      // The facet partial indexes, most selective first.
      const level = q.quality ? QUALITY_LEVELS.indexOf(q.quality) : 0;
      const facet =
        level >= 1 ? [`${t.entries}_quality${level}_downloads`, `e.quality >= ${level}`, "quality"]
        : q.platform ? [`${t.entries}_platform_${q.platform}_downloads`, `e.platforms LIKE '% ${q.platform} %'`, "platform"]
        : q.channel === "security" || q.channel === "preview" ? [`${t.entries}_${q.channel}_downloads`, `e.channel = '${q.channel}'`, "channel"]
        : q.certified ? [`${t.entries}_certified_downloads`, "e.certified = 1", "certified"]
        : q.secure ? [`${t.entries}_secure_downloads`, "e.vulnerabilities = 0", "secure"]
        : null;
      if (facet) {
        index = facet[0]!;
        where.push(facet[1]!);
        used.add(facet[2]!);
      }
    }
    const add = (sql: string, ...values: (string | number)[]) => {
      residual.push(sql);
      residualBinds.push(...values);
    };
    if (q.category && !used.has("category")) {
      if (leaf) add("e.category = ?", q.category);
      else add("(e.category = ? OR (e.category > ? AND e.category < ?))", q.category, `${q.category}/`, `${q.category}0`);
    } else if (q.category && q.category.includes("/") && !leaf) add("(e.category = ? OR (e.category > ? AND e.category < ?))", q.category, `${q.category}/`, `${q.category}0`);
    if (kind === "component" && q.class && !used.has("class")) add("e.class_name = ?", q.class);
    if (q.licence && !used.has("licence")) add("e.licence = ?", q.licence);
    if (publisherId && !used.has("publisher")) add("e.developer_id = ?", publisherId);
    if (q.platform && !used.has("platform")) add("e.platforms LIKE ?", `% ${q.platform} %`);
    if (q.quality && !used.has("quality")) add("e.quality >= ?", QUALITY_LEVELS.indexOf(q.quality));
    if (q.certified !== undefined && !(used.has("certified") && q.certified)) add(`e.certified = ${q.certified ? 1 : 0}`);
    if (q.channel && !used.has("channel")) add("e.channel = ?", q.channel);
    if (q.secure && !used.has("secure")) add("e.vulnerabilities = 0");
    if (q.deprecated === "exclude") add("e.deprecated_at IS NULL");
    if (q.deprecated === "only") add("e.deprecated_at IS NOT NULL");
    if (kind === "component") {
      for (const [direction, values] of [["provides", q.provides], ["requires", q.requires]] as const) {
        for (const value of values ?? []) add(`EXISTS (SELECT 1 FROM component_interfaces i WHERE i.component_id = e.id AND i.version = e.latest_version AND i.direction = '${direction}' AND (i.type = ? OR i.port_id = ?))`, value, value);
      }
    }
    const match = q.q ? ftsQuery(q.q) : null;
    if (q.q && !match) return { rows: [], total: { count: 0, approximate: false }, next: null, previous: null };
    // A search with at most SEARCH_ALL matches orders all of them. With more, matching is one more filter on the listing
    // of the chosen sort (short pages and continue, as for other filters), and relevance ranks the SEARCH_CANDIDATES
    // most downloaded matches. Up to SEARCH_DENSE matches the filter is the set of matches, read once; above, each
    // listed row is looked up in the full-text index with every prefix written out as its terms (a prefix lookup per
    // row is slow), over at most SEARCH_SCAN_BUDGET rows.
    let searchTotal: { count: number; approximate: boolean } | null = null;
    let budget = SCAN_BUDGET;
    if (match) {
      // The term index gives an upper bound on the matches (exact for one word that is one term) without reading them.
      const words = await this.wholeTerms(kind, q.q ?? "");
      let matches = words?.bound ?? (await this.matchCount(kind, match, SEARCH_DENSE + 1));
      // Several words may match far fewer entries together than the bound says.
      if (words && !words.exact && matches > SEARCH_ALL) {
        const few = await this.matchCount(kind, match, SEARCH_ALL + 1);
        if (few <= SEARCH_ALL) matches = few;
      }
      if (matches <= SEARCH_ALL) return this.searchAll(kind, match, [...where, ...residual], [...binds, ...residualBinds], q, sort);
      const terms = matches > SEARCH_DENSE ? (words?.query ?? null) : null;
      const plain = residual.length === 0 && where.length === 1;
      if (terms) {
        residual.push(`EXISTS (SELECT 1 FROM ${t.fts} f WHERE f.${t.fts} MATCH ? AND f.rowid = e.seq)`);
        residualBinds.push(terms);
        budget = SEARCH_SCAN_BUDGET;
      } else {
        residual.push(`e.seq IN (SELECT rowid FROM ${t.fts} WHERE ${t.fts} MATCH ?)`);
        residualBinds.push(match);
      }
      if (plain && (words === null || words.exact)) searchTotal = { count: Math.min(matches, COUNT_CAP), approximate: matches > COUNT_CAP };
      if (q.sort === "relevance") return this.rankTop(kind, index, where, binds, residual, residualBinds, q, searchTotal, budget);
    }

    // Class, provides and requires with at most SET_LIMIT matches: the page reads the matching rows (from the class or
    // interface index) and orders them, so a match is found however low it ranks.
    let from = `${t.entries} e INDEXED BY ${index}`;
    let setTotal: { count: number; approximate: boolean } | null = null;
    if (kind === "component" && !match && (q.class || q.provides || q.requires)) {
      const driver = await this.facetSet(q);
      if (driver) {
        from = `${t.entries} e`;
        where.push(`e.seq IN (${driver.sql})`);
        binds.push(...driver.binds);
        budget = SET_LIMIT + 1;
        const n = (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM ${from} WHERE ${[...where, ...residual].join(" AND ")}`).bind(...binds, ...residualBinds)))?.n ?? 0;
        setTotal = { count: Math.min(n, COUNT_CAP), approximate: n > COUNT_CAP };
      }
    }
    const column = SORT_COLUMN[sort];
    const ascending = sort === "name";
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const back = cursor?.back ?? false;
    // Reading forward follows the sort; reading back reverses it and the page is turned round after.
    const forward = ascending !== back;
    const dir = forward ? "ASC" : "DESC";
    const op = forward ? ">" : "<";
    const value = (r: { downloads: number; trending: number; publishedAt: string; name: string }) => (sort === "downloads" ? r.downloads : sort === "trending" ? r.trending : sort === "updated" ? r.publishedAt : r.name);
    // After a cursor the rows come in two index ranges: the rest of its tie group (equal value, seq beyond), then the
    // rows beyond its value. One row-value comparison would scan the whole tie group, and most entries tie at 0
    // downloads. With filters, each range reads at most SCAN_BUDGET rows.
    const ranges: { extra: string; binds: (string | number)[] }[] = cursor
      ? [
          { extra: `e.${column} = ? AND e.seq ${op} ?`, binds: [cursor.value, cursor.seq] },
          { extra: `e.${column} ${op} ?`, binds: [cursor.value] },
        ]
      : [{ extra: "1", binds: [] }];
    const rows: SummaryRow[] = [];
    let resume: SummaryRow | null = null;
    for (const range of ranges) {
      const want = q.limit + 1 - rows.length;
      if (want <= 0 || resume) break;
      const scan = `SELECT e.* FROM ${from} WHERE ${[...where, range.extra].join(" AND ")} ORDER BY e.${column} ${dir}, e.seq ${dir}`;
      const scanBinds = [...binds, ...range.binds];
      if (residual.length === 0) {
        rows.push(...(await this.all(this.d1.prepare(`SELECT ${SUMMARY_COLUMNS} FROM (${scan} LIMIT ?) e LEFT JOIN developers d ON d.id = e.developer_id ORDER BY e.${column} ${dir}, e.seq ${dir}`).bind(...scanBinds, want))).map(summaryRow));
        continue;
      }
      const found = (await this.all(this.d1.prepare(`SELECT ${SUMMARY_COLUMNS} FROM (${scan} LIMIT ${budget}) e LEFT JOIN developers d ON d.id = e.developer_id WHERE ${residual.join(" AND ")} ORDER BY e.${column} ${dir}, e.seq ${dir} LIMIT ?`).bind(...scanBinds, ...residualBinds, want))).map(summaryRow);
      rows.push(...found);
      // Fewer matches than wanted: when the budget ran out, the next page continues after the last row scanned.
      if (found.length < want) {
        const last = await this.first(this.d1.prepare(`SELECT e.seq, e.downloads, e.trending, e.published_at, e.name FROM (${scan} LIMIT 1 OFFSET ${budget - 1}) e`).bind(...scanBinds));
        if (last) resume = { seq: last.seq as number, downloads: last.downloads as number, trending: last.trending as number, publishedAt: last.published_at as string, name: last.name as string } as SummaryRow;
      }
    }
    const more = rows.length > q.limit || resume !== null;
    const page = rows.slice(0, q.limit);
    if (back) page.reverse();
    const cursorOf = (r: SummaryRow, toBack: boolean) => encodeCursor({ value: value(r), seq: r.seq, back: toBack });
    const first = page[0];
    const last = page[page.length - 1];
    const ahead = back ? (last ?? null) : resume && rows.length <= q.limit ? resume : (last ?? null);
    const next = ahead && (back ? Boolean(cursor) : more) ? cursorOf(back ? last! : ahead, false) : null;
    const previous = first && (back ? more : Boolean(cursor)) ? cursorOf(first, true) : null;
    const total = searchTotal ?? setTotal ?? (await this.knownCount(kind, q, publisherId)) ?? (await this.keptCount(totalsKey(kind, q, publisherId), () => this.count(kind, index, where, binds, residual, residualBinds, budget)));
    return { rows: page, total, next, previous };
  }

  // The smallest of the class, provides and requires sets, as a query of entry seqs, when it has at most SET_LIMIT
  // members; null otherwise. Interfaces count only the newest listed version of each entry.
  private async facetSet(q: ListQuery): Promise<{ sql: string; binds: string[] } | null> {
    // Sizes come from kept counts: the class's implementations, or an interface's rows of every version (an upper
    // bound) read at most SET_LIMIT + 1 deep and kept for TOTALS_SECONDS.
    const capped = async (sql: string, ...binds: string[]) => (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM (${sql} LIMIT ${SET_LIMIT + 1})`).bind(...binds)))?.n ?? 0;
    const sets: { sql: string; binds: string[]; n: number }[] = [];
    if (q.class) {
      const n = (await this.first<{ n: number }>(this.d1.prepare("SELECT implementations AS n FROM classes WHERE name = ?").bind(q.class)))?.n ?? 0;
      sets.push({ sql: "SELECT seq FROM components INDEXED BY components_class_downloads WHERE class_name = ? AND latest_version IS NOT NULL", binds: [q.class], n });
    }
    for (const [direction, values] of [["provides", q.provides], ["requires", q.requires]] as const) {
      for (const value of values ?? []) {
        const n = (await this.keptCount(`interface:${direction}:${value}`, async () => ({ count: (await capped(`SELECT 1 FROM component_interfaces WHERE type = ? AND direction = '${direction}'`, value)) + (await capped(`SELECT 1 FROM component_interfaces WHERE port_id = ? AND direction = '${direction}'`, value)), approximate: false }))).count;
        const by = (column: string) => `SELECT c.seq FROM component_interfaces i JOIN components c ON c.id = i.component_id AND c.latest_version = i.version WHERE i.${column} = ? AND i.direction = '${direction}'`;
        sets.push({ sql: `${by("type")} UNION ${by("port_id")}`, binds: [value, value], n });
      }
    }
    const best = sets.filter((x) => x.n <= SET_LIMIT).sort((a, b) => a.n - b.n)[0];
    return best ? { sql: best.sql, binds: best.binds } : null;
  }

  // Full-text matches, counting at most `limit`.
  private async matchCount(kind: Kind, match: string, limit: number): Promise<number> {
    const t = TABLES[kind];
    return (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM (SELECT rowid FROM ${t.fts} WHERE ${t.fts} MATCH ? LIMIT ?)`).bind(match, limit)))?.n ?? 0;
  }

  // The search with each word written out as its whole terms in the full-text index (a word of PREFIX_MIN or more
  // characters: every term it starts, at most SEARCH_TERMS), and an upper bound on its matches: for each word the sum of
  // its terms' entry counts, the least over the words. `exact` when that is one word of one term. Null when a word has
  // more terms.
  private async wholeTerms(kind: Kind, input: string): Promise<{ query: string; bound: number; exact: boolean } | null> {
    const t = TABLES[kind];
    const groups: string[] = [];
    let bound = Infinity;
    let count = 0;
    const words = searchWords(input);
    for (const w of words) {
      const prefix = w.length >= PREFIX_MIN;
      const end = prefix ? w.slice(0, -1) + String.fromCodePoint(w.codePointAt(w.length - 1)! + 1) : w;
      const rows = await this.all<{ term: string; doc: number }>(this.d1.prepare(`SELECT term, doc FROM ${t.vocab} WHERE term >= ? AND term ${prefix ? "<" : "<="} ? LIMIT ${SEARCH_TERMS + 1}`).bind(w, end));
      if (rows.length > SEARCH_TERMS) return null;
      count += rows.length;
      bound = Math.min(bound, rows.reduce((n, r) => n + r.doc, 0));
      groups.push(rows.length === 0 ? `"${w}"` : `(${rows.map((x) => `"${x.term.replace(/"/g, '""')}"`).join(" OR ")})`);
    }
    if (groups.length === 0) return null;
    return { query: groups.join(" AND "), bound: bound === Infinity ? 0 : bound, exact: words.length === 1 && count <= 1 };
  }

  // Relevance: a word in the name counts most, then in the title or class, then in the summary; then downloads.
  private relevance(kind: Kind, q: ListQuery): { score: string; binds: string[] } {
    const words = searchWords(q.q ?? "");
    const title = kind === "component" ? "COALESCE(e.class_title, '')" : "e.title";
    const text = kind === "component" ? "e.description" : "e.summary";
    return { score: words.map(() => `(instr(lower(e.name), ?) > 0) * 4 + (instr(lower(${title}), ?) > 0) * 2 + (instr(lower(${text}), ?) > 0)`).join(" + ") || "0", binds: words.flatMap((w) => [w, w, w]) };
  }

  // A search with few matches: all of them, filtered and ordered in one query. Pages go by offset.
  private async searchAll(kind: Kind, match: string, where: string[], binds: (string | number)[], q: ListQuery, sort: Exclude<ListQuery["sort"], "relevance">): Promise<ListPage> {
    const t = TABLES[kind];
    const offset = q.cursor ? Math.min(Math.max(0, Number(decodeCursor(q.cursor)?.value ?? 0) || 0), SEARCH_ALL) : 0;
    const { score, binds: scoreBinds } = this.relevance(kind, q);
    const order = q.sort === "relevance" ? "score DESC, e.downloads DESC, e.seq DESC" : `e.${SORT_COLUMN[sort]} ${sort === "name" ? "ASC" : "DESC"}, e.seq DESC`;
    const sql = `WITH c AS (SELECT rowid FROM ${t.fts} WHERE ${t.fts} MATCH ?)
      SELECT ${SUMMARY_COLUMNS}, ${score} AS score, COUNT(*) OVER () AS matched
      FROM c JOIN ${t.entries} e ON e.seq = c.rowid LEFT JOIN developers d ON d.id = e.developer_id
      WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`;
    const raw = await this.all(this.d1.prepare(sql).bind(match, ...scoreBinds, ...binds, q.limit + 1, offset));
    const rows = raw.map(summaryRow);
    return {
      rows: rows.slice(0, q.limit),
      total: { count: (raw[0]?.matched as number | undefined) ?? (offset > 0 ? offset : 0), approximate: false },
      next: rows.length > q.limit ? encodeCursor({ value: offset + q.limit, seq: 0, back: false }) : null,
      previous: offset > 0 ? encodeCursor({ value: Math.max(0, offset - q.limit), seq: 0, back: false }) : null,
    };
  }

  // Relevance over many matches: the SEARCH_CANDIDATES most downloaded matches (from at most SCAN_BUDGET rows of the
  // downloads index), ranked. Pages go by offset.
  private async rankTop(kind: Kind, index: string, where: string[], binds: (string | number)[], residual: string[], residualBinds: (string | number)[], q: ListQuery, known: { count: number; approximate: boolean } | null, budget: number): Promise<ListPage> {
    const t = TABLES[kind];
    const offset = q.cursor ? Math.min(Math.max(0, Number(decodeCursor(q.cursor)?.value ?? 0) || 0), SEARCH_CANDIDATES) : 0;
    const { score, binds: scoreBinds } = this.relevance(kind, q);
    const sql = `SELECT ${SUMMARY_COLUMNS}, ${score} AS score, COUNT(*) OVER () AS matched FROM (
        SELECT e.* FROM (SELECT e.* FROM ${t.entries} e INDEXED BY ${index} WHERE ${where.join(" AND ")} ORDER BY e.downloads DESC, e.seq DESC LIMIT ${budget}) e
        WHERE ${residual.join(" AND ")} ORDER BY e.downloads DESC, e.seq DESC LIMIT ${SEARCH_CANDIDATES}) e
      LEFT JOIN developers d ON d.id = e.developer_id ORDER BY score DESC, e.downloads DESC, e.seq DESC LIMIT ? OFFSET ?`;
    const raw = await this.all(this.d1.prepare(sql).bind(...scoreBinds, ...binds, ...residualBinds, q.limit + 1, offset));
    const rows = raw.map(summaryRow);
    const matched = (raw[0]?.matched as number | undefined) ?? 0;
    return {
      rows: rows.slice(0, q.limit),
      total: known ?? { count: matched, approximate: true },
      next: rows.length > q.limit ? encodeCursor({ value: offset + q.limit, seq: 0, back: false }) : null,
      previous: offset > 0 ? encodeCursor({ value: Math.max(0, offset - q.limit), seq: 0, back: false }) : null,
    };
  }

  // The number of matching entries: up to COUNT_CAP rows of the index, and with other filters, the matches among the
  // first SCAN_BUDGET rows. Above either bound the count is a lower bound (`approximate`).
  private async count(kind: Kind, index: string, where: string[], binds: (string | number)[], residual: string[], residualBinds: (string | number)[], budget = SCAN_BUDGET): Promise<{ count: number; approximate: boolean }> {
    const t = TABLES[kind];
    if (residual.length === 0) {
      const n = (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${t.entries} e INDEXED BY ${index} WHERE ${where.join(" AND ")} LIMIT ${COUNT_CAP + 1})`).bind(...binds)))?.n ?? 0;
      return { count: Math.min(n, COUNT_CAP), approximate: n > COUNT_CAP };
    }
    const r = await this.first<{ scanned: number; n: number }>(this.d1.prepare(`SELECT COUNT(*) AS scanned, COALESCE(SUM(CASE WHEN ${residual.join(" AND ")} THEN 1 ELSE 0 END), 0) AS n FROM (SELECT e.* FROM ${t.entries} e INDEXED BY ${index} WHERE ${where.join(" AND ")} LIMIT ${budget}) e`).bind(...residualBinds, ...binds));
    const n = r?.n ?? 0;
    return { count: Math.min(n, COUNT_CAP), approximate: (r?.scanned ?? 0) >= budget || n > COUNT_CAP };
  }

  // Removes totals older than TOTALS_SECONDS, then the oldest beyond `kept`. Totals are stamped by the clock.
  async pruneListingTotals(kept = TOTALS_KEPT): Promise<void> {
    const now = new Date();
    await this.batch([
      this.d1.prepare("DELETE FROM listing_totals WHERE computed_at < ?").bind(new Date(now.getTime() - TOTALS_SECONDS * 1000).toISOString()),
      this.d1.prepare(`DELETE FROM listing_totals WHERE computed_at <= (SELECT computed_at FROM listing_totals ORDER BY computed_at DESC LIMIT 1 OFFSET ?)`).bind(kept),
    ]);
  }

  // A filtered total, counted once and kept for TOTALS_SECONDS.
  private async keptCount(key: string, count: () => Promise<{ count: number; approximate: boolean }>): Promise<{ count: number; approximate: boolean }> {
    const since = new Date(Date.now() - TOTALS_SECONDS * 1000).toISOString();
    const kept = await this.first<{ count: number; approximate: number }>(this.d1.prepare("SELECT count, approximate FROM listing_totals WHERE key = ? AND computed_at >= ?").bind(key, since));
    if (kept) return { count: kept.count, approximate: kept.approximate === 1 };
    const total = await count();
    await this.batch([this.d1.prepare("INSERT INTO listing_totals (key, count, approximate, computed_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = excluded.count, approximate = excluded.approximate, computed_at = excluded.computed_at").bind(key, total.count, total.approximate ? 1 : 0, new Date().toISOString())]);
    return total;
  }

  // The kept counts answer a listing filtered by nothing, by a category or by a class, without counting rows.
  private async knownCount(kind: Kind, q: ListQuery, publisherId: string | null): Promise<{ count: number; approximate: boolean } | null> {
    const others = q.platform || q.licence || q.quality || q.certified !== undefined || q.channel || q.secure || publisherId || q.provides || q.requires || q.deprecated !== "include" || q.q;
    if (others || (q.category && q.class)) return null;
    const t = TABLES[kind];
    let n: number | null = null;
    if (q.class) n = (await this.first<{ n: number }>(this.d1.prepare("SELECT implementations AS n FROM classes WHERE name = ?").bind(q.class)))?.n ?? null;
    else if (q.category) n = (await this.first<{ n: number }>(this.d1.prepare(`SELECT ${t.count} AS n FROM categories WHERE id = ?`).bind(q.category)))?.n ?? 0;
    else n = (await this.first<{ n: number }>(this.d1.prepare(`SELECT COALESCE(SUM(${t.count}), 0) AS n FROM categories WHERE parent IS NULL`)))?.n ?? 0;
    return n === null ? null : { count: Math.min(n, COUNT_CAP), approximate: n > COUNT_CAP };
  }

  private leafCache = new Map<string, boolean>();

  private async isLeaf(category: string): Promise<boolean> {
    if (!this.leafCache.has(category)) {
      const child = await this.first(this.d1.prepare("SELECT 1 FROM categories WHERE parent = ? LIMIT 1").bind(category));
      this.leafCache.set(category, child === null);
    }
    return this.leafCache.get(category)!;
  }

  // ---------------------------------------------------------------- categories and classes

  async categories(): Promise<(CategoryNode & { classes: number; components: number; recipes: number })[]> {
    return (await this.all(this.d1.prepare("SELECT id, title, parent, classes, components, recipes FROM categories ORDER BY id"))).map((r) => ({ id: r.id as string, title: r.title as string, parent: (r.parent as string | null) ?? null, classes: r.classes as number, components: r.components as number, recipes: r.recipes as number }));
  }

  // The children of a category, or the top categories.
  async categoryChildren(parent: string | null): Promise<(CategoryNode & { classes: number; components: number; recipes: number })[]> {
    const statement = parent === null ? this.d1.prepare("SELECT id, title, parent, classes, components, recipes FROM categories WHERE parent IS NULL ORDER BY title") : this.d1.prepare("SELECT id, title, parent, classes, components, recipes FROM categories WHERE parent = ? ORDER BY title").bind(parent);
    return (await this.all(statement)).map((r) => ({ id: r.id as string, title: r.title as string, parent: (r.parent as string | null) ?? null, classes: r.classes as number, components: r.components as number, recipes: r.recipes as number }));
  }

  async categoryExists(id: string): Promise<boolean> {
    return (await this.first(this.d1.prepare("SELECT 1 FROM categories WHERE id = ?").bind(id))) !== null;
  }

  async categoriesByIds(ids: string[]): Promise<Map<string, CategoryNode>> {
    const out = new Map<string, CategoryNode>();
    for (let i = 0; i < ids.length; i += 90) {
      const group = ids.slice(i, i + 90);
      for (const r of await this.all(this.d1.prepare(`SELECT id, title, parent FROM categories WHERE id IN (${group.map(() => "?").join(", ")})`).bind(...group))) out.set(r.id as string, { id: r.id as string, title: r.title as string, parent: (r.parent as string | null) ?? null });
    }
    return out;
  }

  async addCategories(nodes: CategoryNode[]): Promise<void> {
    // Parents first, so each insert finds its parent.
    const sorted = [...nodes].sort((a, b) => a.id.split("/").length - b.id.split("/").length);
    await this.batch(sorted.map((c) => this.d1.prepare("INSERT INTO categories (id, title, parent) VALUES (?, ?, ?)").bind(c.id, c.title, c.parent)));
  }

  async classBySlug(slug: string): Promise<Raw | null> {
    return this.first(this.d1.prepare("SELECT c.*, d.slug AS publisher_slug, d.display_name AS publisher_name FROM classes c LEFT JOIN developers d ON d.id = c.developer_id WHERE c.slug = ?").bind(slug));
  }

  // The developer who published the first class of a scope, or null.
  async scopeHolder(scope: string): Promise<string | null> {
    return (await this.first<{ developer_id: string | null }>(this.d1.prepare("SELECT developer_id FROM classes WHERE scope = ? ORDER BY created_at, seq LIMIT 1").bind(scope)))?.developer_id ?? null;
  }

  async classByName(name: string): Promise<Raw | null> {
    return this.first(this.d1.prepare("SELECT * FROM classes WHERE name = ?").bind(name));
  }

  async classVersion(classId: string, version: string): Promise<{ version: string; digest: string; descriptor: ClassDescriptor; publishedAt: string } | null> {
    const r = await this.first(this.d1.prepare("SELECT version, digest, descriptor, published_at FROM class_versions WHERE class_id = ? AND version = ?").bind(classId, version));
    return r ? { version: r.version as string, digest: r.digest as string, descriptor: JSON.parse(r.descriptor as string) as ClassDescriptor, publishedAt: r.published_at as string } : null;
  }

  async classVersions(classId: string): Promise<{ version: string; digest: string; publishedAt: string }[]> {
    return (await this.all(this.d1.prepare("SELECT version, digest, published_at FROM class_versions WHERE class_id = ?").bind(classId))).map((r) => ({ version: r.version as string, digest: r.digest as string, publishedAt: r.published_at as string })).sort((a, b) => compareVersions(b.version, a.version));
  }

  // Records a class version. The class row shows its newest version's title, summary, category and presentation.
  async publishClass(existing: Raw | null, fresh: { id: string; name: string; scope: string; slug: string; developerId: string }, descriptor: ClassDescriptor, digest: string, now: string): Promise<void> {
    const statements: D1PreparedStatement[] = [];
    const id = (existing?.id as string | undefined) ?? fresh.id;
    const newest = !existing || compareVersions(descriptor.version, existing.latest_version as string) > 0;
    if (!existing) statements.push(this.d1.prepare("INSERT INTO classes (id, name, scope, slug, developer_id, latest_version, title, summary, category, presentation, implementations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COUNT(*) FROM components WHERE class_name = ? AND latest_version IS NOT NULL), ?, ?)").bind(id, fresh.name, fresh.scope, fresh.slug, fresh.developerId, descriptor.version, descriptor.title, descriptor.summary, descriptor.category, descriptor.presentation, fresh.name, now, now));
    else if (newest) statements.push(this.d1.prepare("UPDATE classes SET latest_version = ?, title = ?, summary = ?, category = ?, presentation = ?, updated_at = ? WHERE id = ?").bind(descriptor.version, descriptor.title, descriptor.summary, descriptor.category, descriptor.presentation, now, id));
    statements.push(this.d1.prepare("INSERT INTO class_versions (class_id, version, digest, descriptor, published_at) VALUES (?, ?, ?, ?, ?)").bind(id, descriptor.version, digest, JSON.stringify(descriptor), now));
    const before = existing ? (existing.category as string) : null;
    const after = newest ? descriptor.category : before;
    if (before !== after) {
      for (const c of ancestors(before)) statements.push(this.d1.prepare("UPDATE categories SET classes = classes - 1 WHERE id = ?").bind(c));
      for (const c of ancestors(after)) statements.push(this.d1.prepare("UPDATE categories SET classes = classes + 1 WHERE id = ?").bind(c));
    }
    await this.batch(statements);
  }

  async listClasses(category: string | null, cursor: string | null, limit: number): Promise<{ rows: Raw[]; total: { count: number; approximate: boolean }; next: string | null }> {
    const where = category ? "(c.category = ? OR (c.category > ? AND c.category < ?))" : "1";
    const binds = category ? [category, `${category}/`, `${category}0`] : [];
    const after = cursor ? decodeCursor(cursor) : null;
    const keyset = after ? " AND (c.category, c.name) > (?, ?)" : "";
    const [category0, name0] = after ? String(after.value).split("\n") : [];
    const rows = await this.all(this.d1.prepare(`SELECT c.*, d.slug AS publisher_slug, d.display_name AS publisher_name FROM classes c LEFT JOIN developers d ON d.id = c.developer_id WHERE ${where}${keyset} ORDER BY c.category, c.name LIMIT ?`).bind(...binds, ...(after ? [category0, name0] : []), limit + 1));
    const n = (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM classes c WHERE ${where} LIMIT ${COUNT_CAP + 1})`).bind(...binds)))?.n ?? 0;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { rows: page, total: { count: Math.min(n, COUNT_CAP), approximate: n > COUNT_CAP }, next: rows.length > limit && last ? encodeCursor({ value: `${last.category}\n${last.name}`, seq: 0, back: false }) : null };
  }

  // The most downloaded listed components whose newest version implements the class version.
  async implementations(className: string, classVersion: string, limit: number): Promise<SummaryRow[]> {
    return (await this.all(this.d1.prepare(`SELECT ${SUMMARY_COLUMNS} FROM components e INDEXED BY components_class_downloads LEFT JOIN developers d ON d.id = e.developer_id WHERE e.latest_version IS NOT NULL AND e.class_name = ? AND +e.class_version = ? ORDER BY e.downloads DESC, e.seq DESC LIMIT ?`).bind(className, classVersion, limit))).map(summaryRow);
  }

  // How many other listed components implement a class, counted up to COUNT_CAP.
  async implementationCount(className: string, except: string): Promise<number> {
    return (await this.first<{ n: number }>(this.d1.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM components e INDEXED BY components_class_downloads WHERE e.latest_version IS NOT NULL AND e.class_name = ? AND +e.name <> ? LIMIT ${COUNT_CAP})`).bind(className, except)))?.n ?? 0;
  }

  // ---------------------------------------------------------------- images

  async image(digest: string): Promise<{ digest: string; type: "png" | "webp"; width: number; height: number; bytes: number } | null> {
    const r = await this.first(this.d1.prepare("SELECT digest, type, width, height, bytes FROM images WHERE digest = ?").bind(digest));
    return r ? { digest: r.digest as string, type: r.type as "png" | "webp", width: r.width as number, height: r.height as number, bytes: r.bytes as number } : null;
  }

  // The images by digest, with whether a published entry names each and whether the developer uploaded its bytes.
  async images(digests: string[], developerId: string): Promise<Map<string, { type: "png" | "webp"; width: number; height: number; claimed: boolean; uploaded: boolean }>> {
    const out = new Map<string, { type: "png" | "webp"; width: number; height: number; claimed: boolean; uploaded: boolean }>();
    if (digests.length === 0) return out;
    const rows = await this.all(this.d1.prepare(`SELECT digest, type, width, height, claimed_at, EXISTS (SELECT 1 FROM image_uploaders u WHERE u.digest = images.digest AND u.developer_id = ?) AS uploaded FROM images WHERE digest IN (${digests.map(() => "?").join(", ")})`).bind(developerId, ...digests));
    for (const r of rows) out.set(r.digest as string, { type: r.type as "png" | "webp", width: r.width as number, height: r.height as number, claimed: r.claimed_at !== null, uploaded: r.uploaded === 1 });
    return out;
  }

  // Records the developer as an uploader of the image; false when already recorded.
  async addUploader(digest: string, developerId: string, now: string): Promise<boolean> {
    const r = await this.d1.prepare("INSERT OR IGNORE INTO image_uploaders (digest, developer_id, uploaded_at) VALUES (?, ?, ?)").bind(digest, developerId, now).run();
    this.note(r.meta as { rows_read?: number });
    return (r.meta.changes ?? 0) > 0;
  }

  // Starts the image's day again: every upload of its bytes, "unchanged" ones too.
  async touchImage(digest: string, now: string): Promise<void> {
    await this.batch([this.d1.prepare("UPDATE images SET last_upload_at = ? WHERE digest = ?").bind(now, digest)]);
  }

  async claimImages(digests: string[], now: string): Promise<void> {
    if (digests.length === 0) return;
    await this.batch([this.d1.prepare(`UPDATE images SET claimed_at = ? WHERE claimed_at IS NULL AND digest IN (${digests.map(() => "?").join(", ")})`).bind(now, ...digests)]);
  }

  async imagesUploadedSince(developerId: string, since: string): Promise<number> {
    return (await this.first<{ n: number }>(this.d1.prepare("SELECT COUNT(*) AS n FROM image_uploaders WHERE developer_id = ? AND uploaded_at >= ?").bind(developerId, since)))?.n ?? 0;
  }

  async unclaimedImages(before: string, limit: number): Promise<string[]> {
    return (await this.all<{ digest: string }>(this.d1.prepare("SELECT digest FROM images WHERE claimed_at IS NULL AND last_upload_at < ? ORDER BY last_upload_at LIMIT ?").bind(before, limit))).map((r) => r.digest);
  }

  async removeImages(digests: string[]): Promise<void> {
    const inList = digests.map(() => "?").join(", ");
    await this.batch([this.d1.prepare(`DELETE FROM image_uploaders WHERE digest IN (SELECT digest FROM images WHERE claimed_at IS NULL AND digest IN (${inList}))`).bind(...digests), this.d1.prepare(`DELETE FROM images WHERE claimed_at IS NULL AND digest IN (${inList})`).bind(...digests)]);
  }

  async addImage(i: { digest: string; type: string; width: number; height: number; bytes: number }, developerId: string, now: string): Promise<void> {
    await this.batch([this.d1.prepare("INSERT OR IGNORE INTO images (digest, type, width, height, bytes, uploaded_at, last_upload_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(i.digest, i.type, i.width, i.height, i.bytes, now, now), this.d1.prepare("INSERT OR IGNORE INTO image_uploaders (digest, developer_id, uploaded_at) VALUES (?, ?, ?)").bind(i.digest, developerId, now)]);
  }

  // ---------------------------------------------------------------- downloads and trending

  // One more download of a version today, unless this visitor already fetched it today.
  async countDownload(kind: Kind, entryId: string, version: string, day: string, visitor: string): Promise<boolean> {
    const t = TABLES[kind];
    const seen = await this.d1.prepare("INSERT OR IGNORE INTO downloads_seen (day, kind, entry_id, version, visitor) VALUES (?, ?, ?, ?, ?)").bind(day, kind, entryId, version, visitor).run();
    this.note(seen.meta as { rows_read?: number });
    if ((seen.meta.changes ?? 0) === 0) return false;
    await this.batch([
      this.d1.prepare("INSERT INTO downloads_daily (kind, entry_id, version, day, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (kind, entry_id, version, day) DO UPDATE SET n = n + 1").bind(kind, entryId, version, day),
      this.d1.prepare(`UPDATE ${t.versions} SET downloads = downloads + 1 WHERE ${t.fk} = ? AND version = ?`).bind(entryId, version),
      this.d1.prepare(`UPDATE ${t.entries} SET downloads = downloads + 1 WHERE id = ?`).bind(entryId),
    ]);
    return true;
  }

  // Removes the hashed download addresses of days before `now`'s (UTC), in downloads_seen and in rate-limit keys, and
  // rate-limit counts older than an hour, so no address hash outlives its day by more than the hour until the next run.
  async forgetVisitors(now: Date): Promise<void> {
    const today = now.toISOString().slice(0, 10);
    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString().slice(0, 16);
    await this.batch([
      this.d1.prepare("DELETE FROM downloads_seen WHERE day < ?").bind(today),
      this.d1.prepare("DELETE FROM rate_limits WHERE minute < ?").bind(hourAgo > `${today}T00:00` ? hourAgo : `${today}T00:00`),
    ]);
  }

  // Counts one request for a key in a minute and returns the count so far.
  async hit(key: string, minute: string): Promise<number> {
    const r = await this.first<{ n: number }>(this.d1.prepare("INSERT INTO rate_limits (key, minute, n) VALUES (?, ?, 1) ON CONFLICT (key, minute) DO UPDATE SET n = n + 1 RETURNING n").bind(key, minute));
    return r?.n ?? 1;
  }

  // The 30-day download counts and trending, refreshed once a day in chunks of DOWNLOAD_CHUNK entries by seq, at most
  // `chunks` chunks a run; the pass resumes on the next run where it stopped. Only rows whose values change are written.
  // trending = downloads in the last 7 days minus the weekly average of the 23 days before.
  async refreshDownloads(today: string, chunks = DOWNLOAD_CHUNKS_PER_RUN, size = DOWNLOAD_CHUNK): Promise<{ chunks: number; done: boolean }> {
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
    const d30 = day(29);
    const d7 = day(6);
    let used = 0;
    let done = true;
    for (const kind of ["component", "recipe"] as const) {
      const t = TABLES[kind];
      const job = `downloads-${kind}`;
      const progress = await this.first<{ pass: string; after: number; done: number }>(this.d1.prepare("SELECT pass, after, done FROM job_progress WHERE job = ?").bind(job));
      let after = progress && progress.pass === today ? progress.after : 0;
      if (progress && progress.pass === today && progress.done === 1) continue;
      while (true) {
        if (used >= chunks) {
          done = false;
          break;
        }
        used += 1;
        const edge = await this.first<{ last: number | null; n: number }>(this.d1.prepare(`SELECT MAX(seq) AS last, COUNT(*) AS n FROM (SELECT seq FROM ${t.entries} WHERE seq > ? ORDER BY seq LIMIT ?)`).bind(after, size));
        const last = edge?.last ?? null;
        const finished = last === null || (edge?.n ?? 0) < size;
        const statements: D1PreparedStatement[] = [];
        if (last !== null) {
          const range = `${t.entries}.seq > ?1 AND ${t.entries}.seq <= ?2`;
          statements.push(
            this.d1
              .prepare(
                `UPDATE ${t.entries} SET downloads = s.d30, trending = s.d7 - (s.d30 - s.d7) * 7.0 / 23
                 FROM (SELECT d.entry_id, SUM(d.n) AS d30, SUM(CASE WHEN d.day >= ?4 THEN d.n ELSE 0 END) AS d7 FROM downloads_daily d
                       WHERE d.kind = '${kind}' AND d.day >= ?3 AND d.entry_id IN (SELECT id FROM ${t.entries} WHERE ${range}) GROUP BY d.entry_id) s
                 WHERE ${t.entries}.id = s.entry_id AND ${range} AND (${t.entries}.downloads <> s.d30 OR ${t.entries}.trending <> s.d7 - (s.d30 - s.d7) * 7.0 / 23)`,
              )
              .bind(after, last, d30, d7),
            this.d1
              .prepare(`UPDATE ${t.entries} SET downloads = 0, trending = 0 WHERE ${range} AND (downloads <> 0 OR trending <> 0) AND NOT EXISTS (SELECT 1 FROM downloads_daily d WHERE d.kind = '${kind}' AND d.entry_id = ${t.entries}.id AND d.day >= ?3)`)
              .bind(after, last, d30),
          );
        }
        statements.push(this.d1.prepare("INSERT INTO job_progress (job, pass, after, done) VALUES (?, ?, ?, ?) ON CONFLICT (job) DO UPDATE SET pass = excluded.pass, after = excluded.after, done = excluded.done").bind(job, today, last ?? after, finished ? 1 : 0));
        await this.batch(statements);
        if (finished) break;
        after = last!;
      }
      if (!done) break;
    }
    if (done) await this.batch([this.d1.prepare(`DELETE FROM downloads_daily WHERE rowid IN (SELECT rowid FROM downloads_daily WHERE day < ? LIMIT 5000)`).bind(day(31))])
    return { chunks: used, done };
  }

  // ---------------------------------------------------------------- vulnerabilities

  async knownAdvisories(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 90) {
      const group = ids.slice(i, i + 90);
      for (const r of await this.all(this.d1.prepare(`SELECT id, modified FROM advisories WHERE id IN (${group.map(() => "?").join(", ")})`).bind(...group))) out.set(r.id as string, r.modified as string);
    }
    return out;
  }

  async saveAdvisories(list: { id: string; summary: string; severity: string | null; fixed: Record<string, string[]>; modified: string }[], now: string): Promise<void> {
    await this.batch(list.map((a) => this.d1.prepare("INSERT INTO advisories (id, summary, severity, fixed, modified, fetched_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET summary = excluded.summary, severity = excluded.severity, fixed = excluded.fixed, modified = excluded.modified, fetched_at = excluded.fetched_at").bind(a.id, a.summary, a.severity, JSON.stringify(a.fixed), a.modified, now)));
  }

  // The count of a version's known advisories that are not waived; NULL when OSV refused one of its purls.
  private static recount(kind: Kind): string {
    const t = TABLES[kind];
    return `CASE
      WHEN EXISTS (SELECT 1 FROM version_purls vp JOIN purls p ON p.purl = vp.purl WHERE vp.kind = '${kind}' AND vp.entry_id = ${t.versions}.${t.fk} AND vp.version = ${t.versions}.version AND (p.unqueryable = 1 OR vp.unresolved = 1)) THEN NULL
      ELSE (SELECT COUNT(DISTINCT a.value) FROM version_purls vp JOIN purls p ON p.purl = vp.purl, json_each(p.advisories) a
        WHERE vp.kind = '${kind}' AND vp.entry_id = ${t.versions}.${t.fk} AND vp.version = ${t.versions}.version
          AND a.value NOT IN (SELECT json_extract(w.value, '$.id') FROM json_each(${t.versions}.waivers) w)) END`;
  }

  // Stores what OSV said about each purl (`unqueryable`: OSV refused it) and counts again every version naming one that
  // was checked before; a version checked for the first time is counted by finishVersions.
  async savePurlResults(results: { purl: string; advisories: string[]; unqueryable?: boolean }[], now: string): Promise<void> {
    if (results.length === 0) return;
    // A few statements per 500 purls, each reading its list as JSON, keep the run within D1's queries per invocation.
    const statements: D1PreparedStatement[] = [];
    for (let i = 0; i < results.length; i += 500) {
      const group = results.slice(i, i + 500);
      const list = JSON.stringify(group.map((r) => ({ p: r.purl, a: JSON.stringify(r.advisories), u: r.unqueryable ? 1 : 0 })));
      const purls = JSON.stringify(group.map((r) => r.purl));
      statements.push(this.d1.prepare("UPDATE purls SET checked_at = ?1, advisories = j.value ->> '$.a', unqueryable = j.value ->> '$.u' FROM json_each(?2) j WHERE purls.purl = j.value ->> '$.p'").bind(now, list));
      statements.push(this.d1.prepare("UPDATE version_purls SET unresolved = 0 WHERE unresolved = 1 AND purl IN (SELECT value FROM json_each(?1))").bind(purls));
      for (const kind of ["component", "recipe"] as const) {
        const t = TABLES[kind];
        const affected = `SELECT entry_id, version FROM version_purls WHERE kind = '${kind}' AND purl IN (SELECT value FROM json_each(?1))`;
        statements.push(this.d1.prepare(`UPDATE ${t.versions} SET vulnerabilities = ${CatalogueDb.recount(kind)} WHERE vulnerabilities_checked_at IS NOT NULL AND (${t.fk}, version) IN (${affected})`).bind(purls));
        statements.push(this.d1.prepare(`UPDATE ${t.entries} SET vulnerabilities = (SELECT v.vulnerabilities FROM ${t.versions} v WHERE v.${t.fk} = ${t.entries}.id AND v.version = ${t.entries}.latest_version) WHERE id IN (SELECT entry_id FROM version_purls WHERE kind = '${kind}' AND purl IN (SELECT value FROM json_each(?1)))`).bind(purls));
      }
    }
    await this.batch(statements);
  }

  // Versions whose vulnerability check is due, the longest waiting first.
  async osvDue(now: string, limit: number): Promise<OsvVersion[]> {
    const out: OsvVersion[] = [];
    for (const kind of ["component", "recipe"] as const) {
      const t = TABLES[kind];
      for (const r of await this.all(this.d1.prepare(`SELECT ${t.fk} AS entry_id, version, osv_alone, osv_runs, osv_due FROM ${t.versions} INDEXED BY ${t.versions}_osv_due WHERE osv_due IS NOT NULL AND osv_due <= ? ORDER BY osv_due LIMIT ?`).bind(now, limit))) {
        out.push({ kind, entryId: r.entry_id as string, version: r.version as string, alone: r.osv_alone === 1, runs: r.osv_runs as number, due: r.osv_due as string });
      }
    }
    return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)).slice(0, limit);
  }

  // The purls of each version, with when each was last checked and whether OSV refused it.
  async osvPurls(versions: OsvVersion[]): Promise<Map<string, { purl: string; checkedAt: string | null; unqueryable: boolean }[]>> {
    const out = new Map<string, { purl: string; checkedAt: string | null; unqueryable: boolean }[]>();
    for (const v of versions) out.set(osvKey(v), []);
    for (const kind of ["component", "recipe"] as const) {
      const ids = [...new Set(versions.filter((v) => v.kind === kind).map((v) => v.entryId))];
      for (let i = 0; i < ids.length; i += 90) {
        const group = ids.slice(i, i + 90);
        const rows = await this.all(this.d1.prepare(`SELECT vp.entry_id, vp.version, vp.purl, p.checked_at, p.unqueryable FROM version_purls vp JOIN purls p ON p.purl = vp.purl WHERE vp.kind = ? AND vp.entry_id IN (${group.map(() => "?").join(", ")})`).bind(kind, ...group));
        for (const r of rows) out.get(osvKey({ kind, entryId: r.entry_id as string, version: r.version as string }))?.push({ purl: r.purl as string, checkedAt: (r.checked_at as string | null) ?? null, unqueryable: r.unqueryable === 1 });
      }
    }
    return out;
  }

  // From now on these versions' purls go to OSV only in batches of their own.
  async osvAlone(versions: OsvVersion[]): Promise<void> {
    await this.batch(this.byVersions(versions, (t, pick) => `UPDATE ${t.versions} SET osv_alone = 1 WHERE (${t.fk}, version) IN (${pick})`));
  }

  // One statement per kind and 500 versions, naming the versions as JSON: `pick` selects (entry id, version) from ?1.
  private byVersions(versions: OsvVersion[], sql: (t: (typeof TABLES)[Kind], pick: string, kind: Kind) => string, ...more: (string | number)[]): D1PreparedStatement[] {
    const out: D1PreparedStatement[] = [];
    for (const kind of ["component", "recipe"] as const) {
      const mine = versions.filter((v) => v.kind === kind);
      for (let i = 0; i < mine.length; i += 500) {
        const list = JSON.stringify(mine.slice(i, i + 500).map((v) => [v.entryId, v.version]));
        out.push(this.d1.prepare(sql(TABLES[kind], "SELECT value ->> 0, value ->> 1 FROM json_each(?1)", kind)).bind(list, ...more));
      }
    }
    return out;
  }

  // Purls of one version whose check gave up: that version's vulnerabilities are unknown.
  async markUnresolved(v: OsvVersion, purls: string[]): Promise<void> {
    if (purls.length === 0) return;
    await this.batch([this.d1.prepare("UPDATE version_purls SET unresolved = 1 WHERE kind = ? AND entry_id = ? AND version = ? AND purl IN (SELECT value FROM json_each(?))").bind(v.kind, v.entryId, v.version, JSON.stringify(purls))]);
  }

  // Versions alone that used their requests this run without an answer for every purl.
  async osvRunSpent(versions: OsvVersion[]): Promise<void> {
    await this.batch(this.byVersions(versions, (t, pick) => `UPDATE ${t.versions} SET osv_runs = osv_runs + 1 WHERE (${t.fk}, version) IN (${pick})`));
  }

  // Versions whose every purl has an answer: counted, stamped checked, and due again at `next`. A version alone whose
  // purls OSV all answered goes back into mixed batches.
  async finishVersions(versions: OsvVersion[], now: string, next: string): Promise<void> {
    await this.batch([
      ...this.byVersions(
        versions,
        (t, pick, kind) => `UPDATE ${t.versions} SET vulnerabilities = ${CatalogueDb.recount(kind)}, vulnerabilities_checked_at = ?2, osv_due = ?3, osv_runs = 0,
          osv_alone = EXISTS (SELECT 1 FROM version_purls vp JOIN purls p ON p.purl = vp.purl WHERE vp.kind = '${kind}' AND vp.entry_id = ${t.versions}.${t.fk} AND vp.version = ${t.versions}.version AND (p.unqueryable = 1 OR vp.unresolved = 1))
          WHERE (${t.fk}, version) IN (${pick})`,
        now,
        next,
      ),
      ...this.byVersions(versions, (t, pick) => `UPDATE ${t.entries} SET vulnerabilities = (SELECT x.vulnerabilities FROM ${t.versions} x WHERE x.${t.fk} = ${t.entries}.id AND x.version = ${t.entries}.latest_version) WHERE id IN (SELECT e FROM (SELECT value ->> 0 AS e FROM json_each(?1)))`),
    ]);
  }


  // The purls of one version that OSV refused.
  async unqueryablePurls(kind: Kind, entryId: string, version: string): Promise<string[]> {
    return (await this.all<{ purl: string }>(this.d1.prepare("SELECT vp.purl FROM version_purls vp JOIN purls p ON p.purl = vp.purl WHERE vp.kind = ? AND vp.entry_id = ? AND vp.version = ? AND (p.unqueryable = 1 OR vp.unresolved = 1) ORDER BY vp.purl").bind(kind, entryId, version))).map((r) => r.purl);
  }

  // The advisories affecting one version, with the purls each affects.
  async versionAdvisories(kind: Kind, entryId: string, version: string): Promise<{ id: string; summary: string; severity: string | null; fixed: Record<string, string[]>; purls: string[] }[]> {
    const rows = await this.all(
      this.d1
        .prepare(
          `SELECT a.value AS id, vp.purl AS purl, x.summary, x.severity, x.fixed FROM version_purls vp JOIN purls p ON p.purl = vp.purl, json_each(p.advisories) a LEFT JOIN advisories x ON x.id = a.value
           WHERE vp.kind = ? AND vp.entry_id = ? AND vp.version = ? ORDER BY a.value, vp.purl`,
        )
        .bind(kind, entryId, version),
    );
    const out = new Map<string, { id: string; summary: string; severity: string | null; fixed: Record<string, string[]>; purls: string[] }>();
    for (const r of rows) {
      const id = r.id as string;
      const known = out.get(id) ?? { id, summary: (r.summary as string | null) ?? "", severity: (r.severity as string | null) ?? null, fixed: parse<Record<string, string[]>>(r.fixed, {}), purls: [] };
      known.purls.push(r.purl as string);
      out.set(id, known);
    }
    return [...out.values()];
  }

  // ---------------------------------------------------------------- deprecation

  async deprecate(kind: Kind, entryId: string, replacement: string | null, now: string): Promise<void> {
    await this.batch([this.d1.prepare(`UPDATE ${TABLES[kind].entries} SET deprecated_at = ?, deprecated_reason = 'owner-deprecated', replacement = ? WHERE id = ? AND developer_id IS NOT NULL`).bind(now, replacement, entryId)]);
  }

  async undeprecate(kind: Kind, entryId: string): Promise<void> {
    await this.batch([this.d1.prepare(`UPDATE ${TABLES[kind].entries} SET deprecated_at = NULL, deprecated_reason = NULL, replacement = NULL WHERE id = ? AND developer_id IS NOT NULL`).bind(entryId)]);
  }

  // Flagged entries under one version: the components that may fill a recipe's slots (preferred components and job
  // candidates), or what a component depends on, followed through dependencies.
  // `checked` counts the distinct components examined, whether or not the catalogue lists them. One result per request, in order.
  async deprecationsFor(items: { kind: Kind; entryId: string; name: string; version: string; developerId: string | null; flag: Flag | null }[]): Promise<{ notices: Deprecation[]; checked: number }[]> {
    if (items.length === 0) return [];
    const statements = items.map((i) => {
      const seed =
        i.kind === "recipe"
          ? "SELECT component_name, component_version, ?1, 1 FROM recipe_slots WHERE recipe_id = ?2 AND version = ?3"
          : "SELECT dependency_name, dependency_version, ?1, 1 FROM component_dependencies WHERE component_id = ?2 AND version = ?3";
      return this.d1
        .prepare(
          `WITH RECURSIVE tree(name, version, via, depth) AS (
             ${seed}
             UNION
             SELECT cd.dependency_name, cd.dependency_version, tree.name, tree.depth + 1
             FROM tree JOIN components c ON c.name = tree.name JOIN component_dependencies cd ON cd.component_id = c.id AND cd.version = tree.version
             WHERE tree.depth < ${MAX_TREE_DEPTH}
           )
           SELECT t.name, t.version, t.via, c.developer_id, c.deprecated_at, c.deprecated_reason, c.replacement FROM tree t LEFT JOIN components c ON c.name = t.name ORDER BY t.name, t.version, t.via`,
        )
        .bind(i.name, i.entryId, i.version);
    });
    const results = await this.batch<Raw>(statements);
    return results.map((res, n) => {
      const item = items[n];
      const merged = new Map<string, Deprecation>();
      if (item.flag) merged.set(`${item.name} ${item.version}`, noticeFor(item.name, item.version, item.developerId, item.flag, []));
      const seen = new Set<string>();
      for (const r of res.results) {
        seen.add(`${r.name} ${r.version}`);
        const flag = flagOf(r);
        if (!flag) continue;
        const key = `${r.name} ${r.version}`;
        const via = r.via as string;
        const known = merged.get(key);
        if (known) {
          if (!known.via.includes(via)) known.via.push(via);
        } else merged.set(key, noticeFor(r.name as string, r.version as string, (r.developer_id as string | null) ?? null, flag, [via]));
      }
      return { notices: [...merged.values()], checked: seen.size };
    });
  }

  // ---------------------------------------------------------------- what recipe pages read of their components

  // The catalogue's rows for the components a recipe prefers; null where a name and version are not listed.
  async catalogueFor(refs: { name: string; version: string }[]): Promise<({ slug: string; row: VersionRow } | null)[]> {
    if (refs.length === 0) return [];
    const results = await this.batch(refs.map((ref) => this.d1.prepare("SELECT e.slug AS entry_slug, v.* FROM component_versions v JOIN components e ON e.id = v.component_id WHERE e.name = ? AND v.version = ? AND v.unlisted_at IS NULL").bind(ref.name, ref.version)));
    return results.map((res) => (res.results[0] ? { slug: res.results[0].entry_slug as string, row: versionRow("component", res.results[0]) } : null));
  }

  // R2 document keys of listed component versions, in request order; null where the catalogue does not list one.
  async documentKeys(refs: { name: string; version: string }[]): Promise<(string | null)[]> {
    if (refs.length === 0) return [];
    const results = await this.batch(refs.map((ref) => this.d1.prepare("SELECT v.document FROM component_versions v JOIN components e ON e.id = v.component_id WHERE e.name = ? AND v.version = ? AND v.unlisted_at IS NULL").bind(ref.name, ref.version)));
    return results.map((res) => (res.results[0]?.document as string | undefined) ?? null);
  }

  // Listed recipes whose newest version names the component in a slot, as the preferred component or a job candidate.
  async recipesUsing(componentName: string): Promise<RecipeUse[]> {
    const rows = await this.all(
      this.d1.prepare(
        `SELECT e.name, e.slug, e.title, e.latest_version AS version, rs.slot_id, MAX(rs.preferred) AS preferred FROM recipe_slots rs JOIN recipes e ON e.id = rs.recipe_id AND e.latest_version = rs.version
         WHERE rs.component_name = ? GROUP BY e.id, rs.slot_id ORDER BY e.name, rs.slot_id LIMIT 200`,
      ).bind(componentName),
    );
    const out: RecipeUse[] = [];
    for (const r of rows) {
      const slot = { id: r.slot_id as string, preferred: r.preferred === 1 };
      const known = out.find((u) => u.name === r.name);
      if (known) known.slots.push(slot);
      else out.push({ name: r.name as string, slug: r.slug as string, title: r.title as string, version: r.version as string, slots: [slot] });
    }
    return out;
  }

  // Security releases on a line: versions of the security channel whose MAJOR.MINOR is `line`.
  async securityReleases(kind: Kind, entryId: string, line: string): Promise<{ version: string; fixes: string[]; publishedAt: string }[]> {
    const t = TABLES[kind];
    const rows = await this.all(this.d1.prepare(`SELECT version, fixes, published_at FROM ${t.versions} WHERE ${t.fk} = ? AND channel = 'security' AND unlisted_at IS NULL AND (version LIKE ? )`).bind(entryId, `${line}.%`));
    return rows.map((r) => ({ version: r.version as string, fixes: parse<string[]>(r.fixes, []), publishedAt: r.published_at as string })).sort((a, b) => compareVersions(b.version, a.version));
  }
}

export interface RecipeUse {
  name: string;
  slug: string;
  title: string;
  version: string;
  slots: { id: string; preferred: boolean }[];
}

// Every component version that may fill a slot of the recipe: each slot's preferred component, then its job's
// candidates (a candidate without a version is the preferred component at the preferred version).
export function slotComponents(r: Recipe): { slot: string; name: string; version: string; preferred: boolean; includedWhen: string | null }[] {
  const out: { slot: string; name: string; version: string; preferred: boolean; includedWhen: string | null }[] = r.components.map((s) => ({ slot: s.id, name: s.preferred.name, version: s.preferred.version, preferred: true, includedWhen: s.includedWhen }));
  for (const job of r.jobs) {
    const slot = r.components.find((s) => s.id === job.slot);
    if (!slot) continue;
    for (const c of job.candidates) {
      const version = c.version ?? slot.preferred.version;
      if (!out.some((o) => o.slot === slot.id && o.name === c.component && o.version === version)) out.push({ slot: slot.id, name: c.component, version, preferred: false, includedWhen: c.includedWhen ?? null });
    }
  }
  return out;
}
