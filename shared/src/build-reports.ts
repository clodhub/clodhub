// Build reports (spec section 6b): one run of an agent building an application from a recipe, as the person saw it.
import { isCatalogueName, isDigest, nameRule, isPackageVersion, isRepository, type Result } from "./catalogue.js";

export const BUILD_REPORT_FORMAT = 2;
export const BUILD_REPORT_KIND = "recipe-build";
// The most bytes a report's JSON may take.
export const BUILD_REPORT_BYTES = 32 * 1024;

export interface BuildResult {
  target: string;
  built: boolean;
  tested: string;
  ran: string;
}

export type AnswerValue = string | number | boolean | null | string[];

export interface BuildReport {
  format: 2;
  kind: "recipe-build";
  recipe: { name: string; version: string; digest: string };
  clod: { repository: string; commit: string };
  date: string;
  agent: { harness: string; model: string; session: string };
  prompt: string;
  conditions: string;
  answers: Record<string, AnswerValue>;
  measured: {
    method: string;
    elapsedMinutes: number;
    waitingForPersonMinutes: number;
    activeMinutes: number;
    replies: number;
    toolCalls: number;
    tokens: { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; total: number };
    costUsd: number;
  };
  results: BuildResult[];
  update: string;
  problems: string[];
  rating: { score: number; of: number; by: string; mostHelpful: string };
}

// What a recipe page shows of a report.
export interface BuildReportView {
  id: string;
  version: string;
  digest: string;
  date: string;
  publishedAt: string;
  // Whether the report's version is the recipe's current version.
  current: boolean;
  agent: { harness: string; model: string };
  activeMinutes: number;
  costUsd: number;
  results: BuildResult[];
  problems: string[];
  rating: BuildReport["rating"];
  url: string;
}

export interface BuildReportList {
  name: string;
  currentVersion: string | null;
  reports: (BuildReportView & { report: BuildReport })[];
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
// Plain text: no control, format or separator characters other than the space, trimmed, within a length.
const plain = (v: unknown, max: number, empty = false): v is string =>
  typeof v === "string" && [...v].length <= max && (empty || v.trim().length > 0) && v === v.trim() && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]/u.test(v) && !/[^\S ]/u.test(v);
const count = (v: unknown, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const amount = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

function exactKeys(r: Rec, keys: readonly string[], where: string, errors: string[]): void {
  for (const k of Object.keys(r)) if (!keys.includes(k)) errors.push(`${where}.${k} is not a field of a build report`);
  for (const k of keys) if (!(k in r)) errors.push(`${where}.${k} is required`);
}

function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function validateBuildReport(input: unknown): Result<"report", BuildReport> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["the body must be a build report object"] };
  exactKeys(input, ["format", "kind", "recipe", "clod", "date", "agent", "prompt", "conditions", "answers", "measured", "results", "update", "problems", "rating"], "report", errors);
  if (input.format !== BUILD_REPORT_FORMAT) errors.push(`format-refused: the build report format is ${BUILD_REPORT_FORMAT}${typeof input.format === "number" && input.format < BUILD_REPORT_FORMAT ? `; a format ${input.format} build report is refused, write it again in format ${BUILD_REPORT_FORMAT} with clod in place of aepm` : ""}`);
  if (input.kind !== BUILD_REPORT_KIND) errors.push(`kind must be ${BUILD_REPORT_KIND}`);
  const need = (ok: boolean, message: string) => void (ok || errors.push(message));
  const r = input.recipe;
  if (!isRecord(r)) errors.push("recipe must be { name, version, digest }");
  else {
    exactKeys(r, ["name", "version", "digest"], "recipe", errors);
    need(isCatalogueName(r.name, "recipe"), `recipe.name must be ${nameRule("recipe")}`);
    need(isPackageVersion(r.version), "recipe.version must be a package version");
    need(isDigest(r.digest), "recipe.digest must be sha256:<64 hex>");
  }
  const a = input.clod;
  if (!isRecord(a)) errors.push("clod must be { repository, commit }");
  else {
    exactKeys(a, ["repository", "commit"], "clod", errors);
    need(isRepository(a.repository), "clod.repository must be owner/name");
    need(typeof a.commit === "string" && /^[0-9a-f]{7,40}$/.test(a.commit), "clod.commit must be 7 to 40 hex digits");
  }
  need(validDate(input.date), "date must be YYYY-MM-DD");
  const g = input.agent;
  if (!isRecord(g)) errors.push("agent must be { harness, model, session }");
  else {
    exactKeys(g, ["harness", "model", "session"], "agent", errors);
    for (const k of ["harness", "model", "session"]) need(plain(g[k], 200), `agent.${k} must be plain text of 1 to 200 characters`);
  }
  need(plain(input.prompt, 2000), "prompt must be plain text of 1 to 2,000 characters");
  need(plain(input.conditions, 2000), "conditions must be plain text of 1 to 2,000 characters");
  need(plain(input.update, 2000), "update must be plain text of 1 to 2,000 characters");
  const answers = input.answers;
  if (!isRecord(answers) || Object.keys(answers).length > 60) errors.push("answers must be an object of at most 60 answers");
  else {
    for (const [k, v] of Object.entries(answers)) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(k)) errors.push(`answers.${k}: an answer id is a letter then letters, digits, "_" or "-"`);
      const ok = v === null || typeof v === "boolean" || amount(v, 1e12) || plain(v, 500, true) || (Array.isArray(v) && v.length <= 30 && v.every((x) => plain(x, 100)));
      if (!ok) errors.push(`answers.${k} must be text of at most 500 characters, a number, true, false, null or a list of short texts`);
    }
  }
  const m = input.measured;
  if (!isRecord(m)) errors.push("measured must be an object");
  else {
    exactKeys(m, ["method", "elapsedMinutes", "waitingForPersonMinutes", "activeMinutes", "replies", "toolCalls", "tokens", "costUsd"], "measured", errors);
    need(plain(m.method, 1000), "measured.method must be plain text of 1 to 1,000 characters");
    for (const k of ["elapsedMinutes", "waitingForPersonMinutes", "activeMinutes"]) need(amount(m[k], 100_000), `measured.${k} must be minutes from 0 to 100,000`);
    for (const k of ["replies", "toolCalls"]) need(count(m[k], 1_000_000), `measured.${k} must be a whole number from 0 to 1,000,000`);
    need(amount(m.costUsd, 100_000), "measured.costUsd must be US dollars from 0 to 100,000");
    const t = m.tokens;
    if (!isRecord(t)) errors.push("measured.tokens must be an object");
    else {
      exactKeys(t, ["input", "output", "reasoning", "cacheRead", "cacheWrite", "total"], "measured.tokens", errors);
      for (const k of ["input", "output", "reasoning", "cacheRead", "cacheWrite", "total"]) need(count(t[k], 1e12), `measured.tokens.${k} must be a whole number`);
    }
  }
  const results = input.results;
  if (!Array.isArray(results) || results.length === 0 || results.length > 20) errors.push("results must list 1 to 20 targets");
  else {
    const seen = new Set<string>();
    results.forEach((x, i) => {
      if (!isRecord(x)) return void errors.push(`results[${i}] must be { target, built, tested, ran }`);
      exactKeys(x, ["target", "built", "tested", "ran"], `results[${i}]`, errors);
      need(typeof x.target === "string" && /^[a-z][a-z0-9-]{0,30}$/.test(x.target) && !seen.has(x.target), `results[${i}].target must be a lower-case target name, once`);
      if (typeof x.target === "string") seen.add(x.target);
      need(typeof x.built === "boolean", `results[${i}].built must be true or false`);
      need(plain(x.tested, 300), `results[${i}].tested must be plain text of 1 to 300 characters`);
      need(plain(x.ran, 300), `results[${i}].ran must be plain text of 1 to 300 characters`);
    });
  }
  const problems = input.problems;
  if (!Array.isArray(problems) || problems.length > 30 || !problems.every((p) => plain(p, 1000))) errors.push("problems must list at most 30 texts of 1 to 1,000 characters");
  const rating = input.rating;
  if (!isRecord(rating)) errors.push("rating must be { score, of, by, mostHelpful }");
  else {
    exactKeys(rating, ["score", "of", "by", "mostHelpful"], "rating", errors);
    need(count(rating.of, 100) && rating.of >= 1, "rating.of must be a whole number from 1 to 100");
    need(count(rating.score, 100) && (typeof rating.of !== "number" || (rating.score as number) <= rating.of), "rating.score must be a whole number from 0 to rating.of");
    need(plain(rating.by, 200), "rating.by must be plain text of 1 to 200 characters");
    need(plain(rating.mostHelpful, 500), "rating.mostHelpful must be plain text of 1 to 500 characters");
  }
  if (errors.length === 0 && new TextEncoder().encode(JSON.stringify(input)).length > BUILD_REPORT_BYTES) errors.push(`the report is larger than ${BUILD_REPORT_BYTES} bytes`);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, report: input as unknown as BuildReport };
}
