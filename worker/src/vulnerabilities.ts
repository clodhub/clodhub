// The hourly vulnerability check: package URLs not checked for a day go to OSV's querybatch (at most 1,000 a request),
// new or changed advisories are fetched once, and every version naming a checked purl is counted again.
import { CatalogueDb } from "./catalogue-db.js";
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

// OSV requests one run may make: batches, the splits that find a refused purl, and advisory records.
export const OSV_CALLS = 40;

export async function checkVulnerabilities(env: Env, deps: Deps): Promise<{ checked: number; advisories: number; unqueryable: string[] }> {
  const db = new CatalogueDb(env.DB);
  const now = deps.now();
  const purls = await db.purlsToCheck(new Date(now.getTime() - DAY).toISOString(), OSV_BATCH);
  if (purls.length === 0) return { checked: 0, advisories: 0, unqueryable: [] };
  const base = env.OSV_API_BASE ?? "https://api.osv.dev";
  let calls = 0;
  const answered = new Map<string, { id: string; modified: string }[]>();
  const refused: string[] = [];
  // OSV refuses a whole batch (400) for one purl it cannot read: halve the batch until the purl is found, then check
  // the rest without it. Purls left when the calls run out wait for the next run.
  const query = async (batch: string[]): Promise<void> => {
    if (batch.length === 0 || calls >= OSV_CALLS) return;
    calls += 1;
    const res = await deps.fetch(`${base}/v1/querybatch`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "ourapps-catalogue (+https://ourapps.app)" }, body: JSON.stringify({ queries: batch.map((purl) => ({ package: { purl } })) }) });
    if (res.status === 400) {
      if (batch.length === 1) return void refused.push(batch[0]!);
      const half = Math.ceil(batch.length / 2);
      await query(batch.slice(0, half));
      await query(batch.slice(half));
      return;
    }
    if (!res.ok) throw new Error(`OSV querybatch answered ${res.status}`);
    const body = (await res.json()) as OsvBatch;
    batch.forEach((purl, i) => answered.set(purl, body.results[i]?.vulns ?? []));
  };
  await query(purls);
  const seen = new Map<string, string>();
  for (const vulns of answered.values()) for (const v of vulns) seen.set(v.id, v.modified);
  const known = await db.knownAdvisories([...seen.keys()]);
  const wanted = [...seen.entries()].filter(([id, modified]) => known.get(id) !== modified).slice(0, Math.max(0, Math.min(ADVISORY_FETCHES, OSV_CALLS - calls)));
  const fetched = await Promise.all(
    wanted.map(async ([id]) => {
      const r = await deps.fetch(`${base}/v1/vulns/${encodeURIComponent(id)}`, { headers: { "User-Agent": "ourapps-catalogue (+https://ourapps.app)" } });
      return r.ok ? ((await r.json()) as OsvRecord) : null;
    }),
  );
  await db.saveAdvisories(fetched.filter((r): r is OsvRecord => r !== null).map(advisoryOf), now.toISOString());
  const have = new Set([...known.keys(), ...fetched.filter((r): r is OsvRecord => r !== null).map((r) => r.id)]);
  // A purl whose advisories could not all be fetched this run is checked again on the next one.
  const complete = [...answered.entries()].filter(([, vulns]) => vulns.every((v) => have.has(v.id)));
  await db.savePurlResults([...complete.map(([purl, vulns]) => ({ purl, advisories: vulns.map((v) => v.id) })), ...refused.map((purl) => ({ purl, advisories: [], unqueryable: true }))], now.toISOString());
  return { checked: complete.length, advisories: fetched.filter(Boolean).length, unqueryable: refused };
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
