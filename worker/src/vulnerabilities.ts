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

export async function checkVulnerabilities(env: Env, deps: Deps): Promise<{ checked: number; advisories: number }> {
  const db = new CatalogueDb(env.DB);
  const now = deps.now();
  const purls = await db.purlsToCheck(new Date(now.getTime() - DAY).toISOString(), OSV_BATCH);
  if (purls.length === 0) return { checked: 0, advisories: 0 };
  const base = env.OSV_API_BASE ?? "https://api.osv.dev";
  const res = await deps.fetch(`${base}/v1/querybatch`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "ourapps-catalogue (+https://ourapps.app)" }, body: JSON.stringify({ queries: purls.map((purl) => ({ package: { purl } })) }) });
  if (!res.ok) throw new Error(`OSV querybatch answered ${res.status}`);
  const batch = (await res.json()) as OsvBatch;
  const results = purls.map((purl, i) => ({ purl, vulns: batch.results[i]?.vulns ?? [] }));
  const seen = new Map<string, string>();
  for (const r of results) for (const v of r.vulns) seen.set(v.id, v.modified);
  const known = await db.knownAdvisories([...seen.keys()]);
  const wanted = [...seen.entries()].filter(([id, modified]) => known.get(id) !== modified).slice(0, ADVISORY_FETCHES);
  const fetched = await Promise.all(
    wanted.map(async ([id]) => {
      const r = await deps.fetch(`${base}/v1/vulns/${encodeURIComponent(id)}`, { headers: { "User-Agent": "ourapps-catalogue (+https://ourapps.app)" } });
      return r.ok ? ((await r.json()) as OsvRecord) : null;
    }),
  );
  await db.saveAdvisories(fetched.filter((r): r is OsvRecord => r !== null).map(advisoryOf), now.toISOString());
  // A purl whose advisories could not all be fetched this run is checked again on the next one.
  const missing = new Set(wanted.filter((_, i) => fetched[i] === null).map(([id]) => id));
  const complete = results.filter((r) => r.vulns.every((v) => !missing.has(v.id) && (known.has(v.id) || wanted.some(([id]) => id === v.id))));
  await db.savePurlResults(complete.map((r) => ({ purl: r.purl, advisories: r.vulns.map((v) => v.id) })), now.toISOString());
  return { checked: complete.length, advisories: fetched.filter(Boolean).length };
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
