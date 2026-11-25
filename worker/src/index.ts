import { TERMS_VERSION } from "@clodhub/shared";
import { currentDeveloper, finishLogin, logout, logoutEverywhere, oauthConfigured, requireDeveloper, requireTerms, startLogin } from "./auth.js";
import { defaultDeps, type Deps, type Env } from "./env.js";
import { randomId } from "./crypto.js";
import { HttpError, json } from "./http.js";
import * as dev from "./routes/dev.js";
import * as catalogue from "./routes/catalogue.js";
import { CatalogueDb } from "./catalogue-db.js";
import { checkVulnerabilities } from "./vulnerabilities.js";
import { removeUnclaimedImages } from "./routes/catalogue.js";

// Sent on every response so browsers and scanners see a locked-down site.
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

// HttpError messages are written for clients; anything else may carry internal detail, so it is
// logged and the client gets a reference only.
export function errorResponse(request: Request, err: unknown): Response {
  if (err instanceof HttpError) {
    if (err.status >= 500) console.error(err.message);
    return json({ error: err.message }, err.status);
  }
  const ref = request.headers.get("cf-ray") ?? randomId(6);
  console.error(`unexpected error ${ref}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  return json({ error: `something went wrong (reference ${ref})` }, 500);
}

export async function handle(request: Request, env: Env, deps: Deps = defaultDeps): Promise<Response> {
  let res: Response;
  try {
    res = await route(request, env, deps);
  } catch (err) {
    res = errorResponse(request, err);
  }
  res = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
  return res;
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const m = request.method;

  if (parts[0] === "dl" && parts.length === 2 && m === "GET") return catalogue.serveArtefact(env, deps, parts[1]!);
  if (parts[0] !== "api") {
    if (m === "GET" && parts.length === 1 && parts[0] === "sitemap.xml") return catalogue.sitemap(env);
    if (m === "GET" && parts.length === 2 && parts[0] === "images") return catalogue.image(env, parts[1]!);
    const variant = m === "GET" ? catalogue.pageVariant(env, parts, url, request) : null;
    if (variant) return variant;
    if (env.ASSETS) return env.ASSETS.fetch(request);
    throw new HttpError(404, "not found");
  }
  const p = parts.slice(1);

  if (p[0] === "health" && m === "GET") return json({ ok: true, oauth: oauthConfigured(env), links: Boolean(env.LINK_SECRET), secrets: Boolean(env.MASTER_KEY) });

  if (p[0] === "auth") {
    if ((p[1] === "github" || p[1] === "login") && m === "GET") return startLogin(env);
    if (p[1] === "callback" && m === "GET") return finishLogin(request, env, deps);
    // The site asks who is signed in on every page; a visitor gets null, not an error.
    if (p[1] === "session" && m === "GET") {
      const me = await currentDeveloper(request, env, deps);
      return me ? dev.me(env, me) : json(null);
    }
    if (p[1] === "logout" && m === "POST") return logout(request, env, deps);
    if (p[1] === "logout-everywhere" && m === "POST") return logoutEverywhere(request, env, deps, await requireDeveloper(request, env, deps));
  }

  if ((p[0] === "recipes" || p[0] === "components") && m === "GET") {
    const kind = p[0] === "recipes" ? "recipe" : "component";
    if (p.length === 1) return catalogue.list(env, kind, url);
    if (p.length === 2) return catalogue.versionView(env, kind, p[1]!, "latest");
    if (kind === "recipe" && p[2] === "reports" && (p.length === 3 || p.length === 4)) return catalogue.buildReports(env, p[1]!, p[3] ?? null);
    if (p.length === 3) return catalogue.versionView(env, kind, p[1]!, p[2]!);
    if (p.length === 4 && p[3] === "bundle") return catalogue.bundle(request, env, deps, kind, p[1]!, p[2]!);
    if (p.length === 4 && p[3] === "diagram.svg" && kind === "recipe") return catalogue.recipeDiagram(env, p[1]!, p[2]!);
    if (p.length === 4 && p[3] === "components.svg" && kind === "recipe") return catalogue.recipeComponentsDiagram(env, p[1]!, p[2]!);
    if (p.length === 4 && p[3] === "connections.svg" && kind === "component") return catalogue.componentConnectionsDiagram(env, p[1]!, p[2]!);
    if (p.length === 4 && p[3] === "deprecations") return catalogue.deprecations(env, kind, p[1]!, p[2]!);
    if (p.length === 4 && p[3] === "details") return catalogue.versionDetails(env, kind, p[1]!, p[2]!);
    if (p.length === 4 && p[3] === "vulnerabilities") return catalogue.vulnerabilities(env, kind, p[1]!, p[2]!);
  }
  if (p[0] === "classes" && m === "GET") {
    if (p.length === 1) return catalogue.listClasses(env, url);
    if (p.length === 2) return catalogue.classDetail(env, p[1]!, "latest");
    if (p.length === 3) return catalogue.classDetail(env, p[1]!, p[2]!);
  }
  if (p[0] === "categories" && p.length === 1 && m === "GET") return catalogue.categories(env);

  if (p[0] === "dev") {
    const me = await requireDeveloper(request, env, deps);
    if (p[1] === "me" && m === "GET") return dev.me(env, me);
    if (p[1] === "terms" && m === "POST") return dev.acceptTerms(request, env, deps, me);
    requireTerms(me, TERMS_VERSION);
    if (p[1] === "me" && m === "DELETE") return dev.deleteAccount(request, env, deps, me);
    if (p[1] === "me" && m === "PUT") return dev.updateMe(request, env, me);
    if (p[1] === "secrets" && m === "PUT") return dev.updateSecrets(request, env, deps, me);
    if (p[1] === "recipes" || p[1] === "components") {
      const recipes = p[1] === "recipes";
      if (p.length === 2 && m === "GET") return catalogue.listMine(env, me, recipes ? "recipe" : "component");
      if (p.length === 2 && m === "POST") return recipes ? catalogue.publishRecipe(request, env, deps, me) : catalogue.publishComponent(request, env, deps, me);
      if (p.length === 5 && m === "POST" && p[4] === "quality") return catalogue.setQuality(request, env, deps, me, recipes ? "recipe" : "component", p[2]!, p[3]!);
      if (recipes && p.length === 4 && m === "POST" && p[3] === "reports") return catalogue.publishBuildReport(request, env, deps, me, p[2]!);
      if (p.length === 4 && m === "POST" && (p[3] === "deprecate" || p[3] === "undeprecate")) return catalogue.setDeprecation(request, env, deps, me, recipes ? "recipe" : "component", p[2], p[3] === "deprecate");
      if ((p.length === 3 || p.length === 4) && m === "DELETE") return catalogue.unlist(request, env, deps, me, recipes ? "recipe" : "component", p[2], p[3] ?? null);
    }
    if (p[1] === "classes" && p.length === 2 && m === "POST") return catalogue.publishClass(request, env, deps, me);
    if (p[1] === "categories" && p.length === 2 && m === "POST") return catalogue.publishCategories(request, env, deps, me);
    if (p[1] === "images" && p.length === 3 && m === "PUT") return catalogue.uploadImage(request, env, deps, me, p[2]!);
    if (p[1] === "keys") {
      if (p.length === 2 && m === "GET") return dev.listKeys(env, me);
      if (p.length === 2 && m === "POST") return dev.createKey(request, env, deps, me);
      if (p.length === 3 && p[2] === "revoke-all" && m === "POST") return dev.revokeAllKeys(request, env, deps, me);
      if (p.length === 3 && m === "DELETE") return dev.revokeKey(request, env, deps, me, p[2]);
    }
    if (p[1] === "audit" && p.length === 2 && m === "GET") return dev.auditLog(env, me);
  }
  throw new HttpError(404, "not found");
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(scheduled(event.cron, env, defaultDeps)),
} satisfies ExportedHandler<Env>;

// The cron trigger in wrangler.jsonc, hourly: the vulnerability check, the next chunks of the day's download refresh,
// the images nobody named within a day, the download address hashes of past days, and old listing totals. Each runs
// whatever the others do; a failure is logged.
export async function scheduled(cron: string, env: Env, deps: Deps): Promise<void> {
  if (cron !== "7 * * * *") return;
  const tasks: [string, () => Promise<unknown>][] = [
    ["vulnerability check", () => checkVulnerabilities(env, deps)],
    ["download refresh", () => new CatalogueDb(env.DB).refreshDownloads(deps.now().toISOString().slice(0, 10))],
    ["image clean-up", () => removeUnclaimedImages(env, deps)],
    ["download address clean-up", () => new CatalogueDb(env.DB).forgetVisitors(deps.now())],
    ["listing totals clean-up", () => new CatalogueDb(env.DB).pruneListingTotals()],
  ];
  for (const [name, task] of tasks) {
    try {
      await task();
    } catch (e) {
      console.error(`hourly ${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
