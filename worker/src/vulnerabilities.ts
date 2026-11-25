// The hourly vulnerability check: each due version's package URLs go to OSV's querybatch (at most 1,000 a request), new
// or changed advisories are fetched once, and every version naming a checked purl is counted again.
import { CatalogueDb, osvKey, type OsvVersion } from "./catalogue-db.js";
import type { Deps, Env } from "./env.js";

export const OSV_BATCH = 1000;
// Advisory records fetched per run; the rest are fetched on later runs.
export const ADVISORY_FETCHES = 40;

interface OsvBatch {
  results: { vulns?: { id: string; modified: string }[]; next_page_token?: string }[];
}

interface OsvRecord {
  id: string;
  summary?: string;
  details?: string;
  modified: string;
  database_specific?: { severity?: string };
  severity?: { type: string; score: string }[];
  affected?: { package?: { name?: string; ecosystem?: string; purl?: string }; ranges?: { events?: { fixed?: string }[] }[] }[];
}

const DAY = 86_400_000;

// Querybatch requests one run may make, the part of them mixed batches may use, the most one version may spend finding
// the purls OSV refuses, and the versions one run looks at.
export const OSV_CALLS = 40;
export const MIXED_CALLS = 16;
export const VERSION_CALLS = 12;
export const VERSION_RUNS = 3;
export const DUE_VERSIONS = 5000;

const HEADERS = { "Content-Type": "application/json", "User-Agent": "clodhub (+https://clodhub.com)" };

// Versions are checked whole. Each version's purls not checked for a day go to OSV: versions never refused go together
// in batches of at most OSV_BATCH purls; a batch OSV refuses (400) marks its versions `osv_alone`, and from then on each
// of them goes in batches of its own. A version alone that OSV refuses is halved to find the purls it cannot read, with
// at most VERSION_CALLS requests a run; answers are kept, so the next run goes on with the purls left. After
// VERSION_RUNS runs the purls still without an answer are marked unresolved for that version only (its vulnerabilities
// are unknown); only a purl OSV refused on its own is marked unqueryable for every version. A version whose purls OSV all answered
// goes back into mixed batches; one holding a refused purl stays alone. Mixed batches use at most MIXED_CALLS
// requests, so versions alone never hold back the others. A purl OSV refused is not sent again.
export async function checkVulnerabilities(env: Env, deps: Deps): Promise<{ checked: number; advisories: number; unqueryable: string[] }> {
  const db = new CatalogueDb(env.DB);
  const now = deps.now();
  const nowIso = now.toISOString();
  const stale = new Date(now.getTime() - DAY).toISOString();
  const due = await db.osvDue(nowIso, DUE_VERSIONS);
  if (due.length === 0) return { checked: 0, advisories: 0, unqueryable: [] };
  const purls = await db.osvPurls(due);
  const wanted = new Map<string, string[]>();
  for (const v of due) wanted.set(osvKey(v), (purls.get(osvKey(v)) ?? []).filter((p) => !p.unqueryable && (p.checkedAt === null || p.checkedAt < stale)).map((p) => p.purl));
  const base = env.OSV_API_BASE ?? "https://api.osv.dev";
  let calls = 0;
  const answered = new Map<string, { id: string; modified: string }[]>();
  const refused = new Set<string>();
  const handled = new Set<string>();
  const post = async (batch: string[]): Promise<{ id: string; modified: string }[][] | null> => {
    calls += 1;
    const res = await deps.fetch(`${base}/v1/querybatch`, { method: "POST", headers: HEADERS, body: JSON.stringify({ queries: batch.map((purl) => ({ package: { purl } })) }) });
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`OSV querybatch answered ${res.status}`);
    const body = (await res.json()) as OsvBatch;
    return batch.map((_, i) => body.results[i]?.vulns ?? []);
  };
  const record = (batch: string[], results: { id: string; modified: string }[][]) => batch.forEach((purl, i) => answered.set(purl, results[i]!));

  // Versions with nothing to send are finished at once.
  for (const v of due) if (wanted.get(osvKey(v))!.length === 0) handled.add(osvKey(v));

  // Mixed batches of whole versions.
  const mixed = due.filter((v) => !v.alone && !handled.has(osvKey(v)));
  let batch: { versions: OsvVersion[]; purls: Set<string> } = { versions: [], purls: new Set() };
  const batches: (typeof batch)[] = [];
  for (const v of mixed) {
    const list = wanted.get(osvKey(v))!;
    if (list.length > OSV_BATCH) {
      v.alone = true;
      continue;
    }
    if (batch.purls.size + list.length > OSV_BATCH) (batches.push(batch), (batch = { versions: [], purls: new Set() }));
    batch.versions.push(v);
    list.forEach((p) => batch.purls.add(p));
  }
  if (batch.versions.length > 0) batches.push(batch);
  const refusedTogether: OsvVersion[] = [];
  const spent: OsvVersion[] = [];
  const unresolved = new Map<string, string[]>();
  for (const b of batches) {
    if (calls >= MIXED_CALLS) break;
    const list = [...b.purls];
    const results = await post(list);
    if (results === null) {
      refusedTogether.push(...b.versions);
      continue;
    }
    record(list, results);
    b.versions.forEach((v) => handled.add(osvKey(v)));
  }
  await db.osvAlone([...refusedTogether, ...due.filter((v) => v.alone && wanted.get(osvKey(v))!.length > OSV_BATCH)]);
  refusedTogether.forEach((v) => (v.alone = true));

  // Versions alone, each with at most VERSION_CALLS requests (fewer when the run has fewer left). A run counts toward
  // VERSION_RUNS only when the version had all VERSION_CALLS.
  for (const v of due.filter((x) => x.alone && !handled.has(osvKey(x)))) {
    if (calls >= OSV_CALLS) break;
    let budget = Math.min(VERSION_CALLS, OSV_CALLS - calls);
    const full = budget === VERSION_CALLS;
    const last = full && v.runs + 1 >= VERSION_RUNS;
    const left: string[] = [];
    const givenUp: string[] = [];
    const pending: string[][] = [];
    const list = wanted.get(osvKey(v))!;
    for (let i = 0; i < list.length; i += OSV_BATCH) pending.push(list.slice(i, i + OSV_BATCH));
    while (pending.length > 0) {
      const part = pending.shift()!;
      if (budget === 0) {
        part.forEach((p) => (last ? givenUp.push(p) : left.push(p)));
        continue;
      }
      budget -= 1;
      const results = await post(part);
      if (results !== null) record(part, results);
      else if (part.length === 1) refused.add(part[0]!);
      else pending.unshift(part.slice(0, Math.ceil(part.length / 2)), part.slice(Math.ceil(part.length / 2)));
    }
    if (left.length > 0 && full) spent.push(v);
    if (givenUp.length > 0) unresolved.set(osvKey(v), givenUp);
    if (left.length === 0) handled.add(osvKey(v));
  }
  await db.osvRunSpent(spent);

  // Advisory records not held yet, or changed.
  const seen = new Map<string, string>();
  for (const vulns of answered.values()) for (const x of vulns) seen.set(x.id, x.modified);
  const known = await db.knownAdvisories([...seen.keys()]);
  const fetchIds = [...seen.entries()].filter(([id, modified]) => known.get(id) !== modified).slice(0, ADVISORY_FETCHES);
  const fetched = (
    await Promise.all(
      fetchIds.map(async ([id]) => {
        const r = await deps.fetch(`${base}/v1/vulns/${encodeURIComponent(id)}`, { headers: { "User-Agent": HEADERS["User-Agent"] } });
        return r.ok ? ((await r.json()) as OsvRecord) : null;
      }),
    )
  ).filter((r): r is OsvRecord => r !== null);
  await db.saveAdvisories(fetched.map(advisoryOf), nowIso);
  const have = new Set([...known.keys(), ...fetched.map((r) => r.id)]);
  // A purl whose advisories could not all be fetched this run is asked again on the next one, and so is its version.
  const complete = [...answered.entries()].filter(([, vulns]) => vulns.every((x) => have.has(x.id)));
  const completeSet = new Set(complete.map(([p]) => p));
  await db.savePurlResults([...complete.map(([purl, vulns]) => ({ purl, advisories: vulns.map((x) => x.id) })), ...[...refused].map((purl) => ({ purl, advisories: [], unqueryable: true }))], nowIso);
  for (const v of due) await db.markUnresolved(v, unresolved.get(osvKey(v)) ?? []);
  const finished = due.filter((v) => handled.has(osvKey(v)) && wanted.get(osvKey(v))!.every((p) => completeSet.has(p) || refused.has(p) || unresolved.get(osvKey(v))?.includes(p)));
  await db.finishVersions(finished, nowIso, new Date(now.getTime() + DAY).toISOString());
  return { checked: finished.length, advisories: fetched.length, unqueryable: [...refused] };
}

export function advisoryOf(r: OsvRecord): { id: string; summary: string; severity: string | null; fixed: Record<string, string[]>; modified: string } {
  const fixed: Record<string, string[]> = {};
  for (const a of r.affected ?? []) {
    const name = a.package?.purl ?? (a.package?.name ? `${a.package.ecosystem ?? ""}:${a.package.name}` : "");
    for (const range of a.ranges ?? []) for (const e of range.events ?? []) if (e.fixed) (fixed[name] ??= []).push(e.fixed);
  }
  const severity = r.database_specific?.severity ?? r.severity?.[0]?.score ?? null;
  return { id: r.id, summary: (r.summary ?? r.details ?? "").slice(0, 500), severity: severity ? String(severity).slice(0, 120) : null, fixed, modified: r.modified };
}
