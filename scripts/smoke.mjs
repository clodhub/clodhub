// Live check of ClodHub against a running deployment, the way an agent uses it.
// Usage: CLODHUB_API_KEY=ch_... node scripts/smoke.mjs [--base https://clodhub.com]
// Without a key only the public part runs: every listed recipe and component, with the size limits. With a manage
// key it also checks the developer routes and that every GET route agents.md lists was called. It changes nothing.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const baseAt = args.indexOf("--base");
const base = (baseAt >= 0 ? args[baseAt + 1] : "https://clodhub.com").replace(/\/$/, "");
const local = /^http:\/\/localhost(:\d+)?$/.test(base);
const key = process.env.CLODHUB_API_KEY ?? "";
const agentsMd = readFileSync(new URL("../site/public/agents.md", import.meta.url), "utf8");

const results = [];
const exercised = new Set();
let failures = 0;

function record(ok, name, detail = "") {
  results.push({ ok, name, detail });
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
}

// Records the call against the documented route pattern, then returns status, headers and parsed body.
async function call(method, path, { body, rawBody, auth = key, token, pattern } = {}) {
  exercised.add(`${method} ${pattern ?? path}`);
  const headers = { Accept: "application/json" };
  if (body !== undefined || rawBody !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(base + path, { method, headers, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: "manual" });
  const text = method === "HEAD" ? "" : await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

const has = (obj, keys) => keys.filter((k) => !(obj && k in obj));
function expectKeys(name, obj, keys) {
  const missing = has(obj, keys);
  record(missing.length === 0, name, missing.length ? `missing ${missing.join(", ")}` : "");
}
function expectStatus(name, res, status) {
  const ok = Array.isArray(status) ? status.includes(res.status) : res.status === status;
  record(ok, name, ok ? "" : `status ${res.status}, body ${res.text.slice(0, 160)}`);
}

// Documented endpoints: lines in agents.md code blocks that start with a method and an /api path.
function documentedEndpoints() {
  const out = new Set();
  for (const m of agentsMd.matchAll(/^(GET|POST|PUT|DELETE|HEAD)(?:,\s*(?:GET|POST|PUT|DELETE|HEAD))*\s+(\/api\/[^\s`]+)/gm)) out.add(`${m[1]} ${m[2]}`);
  for (const m of agentsMd.matchAll(/`(GET|POST|PUT|DELETE|HEAD)(?:\|(?:GET|HEAD))?\s+(\/api\/[^\s`]+)`/g)) out.add(`${m[1]} ${m[2]}`);
  return [...out].map((e) => e.replace(/\?.*$/, ""));
}

async function publicChecks() {
  const health = await call("GET", "/api/health", { auth: "" });
  record(health.status === 200 && health.json?.ok === true && health.json?.links && health.json?.secrets, "health reports the link and master secrets configured", JSON.stringify(health.json));
  if (!local && !health.json?.oauth) console.log("note: GitHub sign-in is not configured (GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET)");
  const login = await call("GET", "/api/auth/login", { auth: "" });
  const toGitHub = login.status === 302 && (login.headers.get("Location") ?? "").includes("/login/oauth/authorize?");
  record(health.json?.oauth ? toGitHub : login.status === 503, "GET /api/auth/login sends a browser to GitHub, or answers 503 without sign-in", String(login.status));
  for (const path of ["/agents.md", "/contract.md", "/llms.txt", "/free-tiers.md", "/cloud-assembly.md", "/aepm-assemble.yml", "/policy/levelnpolicy.json", "/docs/package-foundations.md", "/terms", "/robots.txt", "/sitemap.xml"]) {
    const res = await fetch(base + path);
    record(res.status === 200, `GET ${path}`, res.status === 200 ? "" : String(res.status));
  }
  await textPageChecks();
  expectStatus("an unknown component is a 404", await call("GET", "/api/components/no-such-component", { auth: "", pattern: "/api/components/:name" }), 404);
  expectStatus("the dev API needs a key", await call("GET", "/api/dev/components", { auth: "" }), 401);
  const badKey = await call("GET", "/api/dev/me", { auth: "ch_" + "0".repeat(40) });
  expectStatus("an unknown key is refused", badKey, 401);
}

// Every listed recipe and component text page stays small (recipes under 60,000 bytes, components under 30,000) and
// links its details page, which answers. Each version response stays small too (recipes under 100,000 bytes, components
// under 30,000) and gives counts whose lists its details route returns.
async function textPageChecks() {
  for (const [kind, limit, apiLimit] of [["recipes", 60_000, 100_000], ["components", 30_000, 30_000]]) {
    const listed = await call("GET", `/api/${kind}?limit=100`, { auth: "", pattern: `/api/${kind}` });
    const entries = listed.status === 200 ? listed.json[kind] : [];
    expectStatus(`GET /api/${kind}`, listed, 200);
    expectStatus(`GET /api/${kind}?q=`, await call("GET", `/api/${kind}?q=a`, { auth: "", pattern: `/api/${kind}` }), 200);
    let largest = ["none", 0];
    let largestApi = ["none", 0];
    for (const { slug, version } of entries) {
      const res = await fetch(`${base}/${kind}/${slug}.txt`);
      const text = await res.text();
      const size = new TextEncoder().encode(text).length;
      if (size > largest[1]) largest = [slug, size];
      const details = `${base}/${kind}/${slug}/details.txt?version=${version}`;
      record(res.status === 200 && size < limit && text.includes(details), `/${kind}/${slug}.txt is under ${limit} bytes and links its details`, `${res.status}, ${size} bytes`);
      const more = await fetch(details);
      record(more.status === 200, `GET /${kind}/${slug}/details.txt`, String(more.status));
      const view = await call("GET", `/api/${kind}/${slug}/${version}`, { auth: "", pattern: `/api/${kind}/:name/:version` });
      const viewSize = new TextEncoder().encode(view.text).length;
      if (viewSize > largestApi[1]) largestApi = [slug, viewSize];
      const counts = view.json?.foundations?.counts;
      record(view.status === 200 && viewSize < apiLimit && counts && !("upstream" in view.json.foundations), `GET /api/${kind}/${slug}/${version} is under ${apiLimit} bytes and gives counts`, `${view.status}, ${viewSize} bytes`);
      record(Array.isArray(view.json?.versions) && view.json.versions.every((v) => typeof v.channel === "string" && Array.isArray(v.fixes)), `GET /api/${kind}/${slug}/${version} gives each version's channel and fixes`);
      const full = await call("GET", `/api/${kind}/${slug}/${version}/details`, { auth: "", pattern: `/api/${kind}/:name/:version/details` });
      const f = full.json?.foundations;
      record(full.status === 200 && f && counts && f.upstream.length === counts.upstream && f.compatibility.dependencies.length === counts.dependencies && f.files.length === counts.files, `GET /api/${kind}/${slug}/${version}/details matches the counts`, String(full.status));
    }
    const first = entries[0];
    if (first) {
      const latest = await call("GET", `/api/${kind}/${first.slug}/latest`, { auth: "", pattern: `/api/${kind}/<name>/latest` });
      record(latest.status === 200 && latest.json?.version === first.version, `GET /api/${kind}/<name>/latest gives the listed version`, `${latest.status} ${latest.json?.version}`);
      expectStatus(`GET /api/${kind}/:name/:version/bundle`, await call("GET", `/api/${kind}/${first.slug}/${first.version}/bundle`, { auth: "", pattern: `/api/${kind}/:name/:version/bundle` }), 200);
      expectStatus(`GET /api/${kind}/:name/:version/deprecations`, await call("GET", `/api/${kind}/${first.slug}/${first.version}/deprecations`, { auth: "", pattern: `/api/${kind}/:name/:version/deprecations` }), 200);
      const vulns = await call("GET", `/api/${kind}/${first.slug}/${first.version}/vulnerabilities`, { auth: "", pattern: `/api/${kind}/:name/:version/vulnerabilities` });
      record(vulns.status === 200 && Array.isArray(vulns.json?.advisories), `GET /api/${kind}/:name/:version/vulnerabilities`, String(vulns.status));
      const withImage = entries.find((e) => e.thumbnail);
      if (withImage) {
        const img = await fetch(withImage.thumbnail);
        record(img.status === 200 && /immutable/.test(img.headers.get("Cache-Control") ?? ""), `GET ${new URL(withImage.thumbnail).pathname} is served with immutable caching`, String(img.status));
      }
      if (kind === "recipes") expectStatus("GET /api/recipes/:name/:version/diagram.svg", await call("GET", `/api/recipes/${first.slug}/${first.version}/diagram.svg`, { auth: "", pattern: "/api/recipes/:name/:version/diagram.svg" }), [200, 404]);
    }
    // A listing page reads about one page of rows, whatever the catalogue's size.
    const page = await fetch(`${base}/api/${kind}?sort=downloads&limit=30`);
    const rows = Number(page.headers.get("X-D1-Rows-Read"));
    record(page.ok && rows < 2000, `/api/${kind} reads at most 2,000 rows for a page`, `${rows} rows read`);
    const body = await page.json();
    if (body.next) record((await fetch(`${base}/api/${kind}?sort=downloads&limit=30&cursor=${body.next}`)).ok, `/api/${kind} turns the page with its cursor`);
    console.log(`     largest /${kind} text page: ${largest[0]}, ${largest[1]} bytes; largest version response: ${largestApi[0]}, ${largestApi[1]} bytes`);
  }
  const classes = await call("GET", "/api/classes", { auth: "", pattern: "/api/classes" });
  expectStatus("GET /api/classes", classes, 200);
  const firstClass = classes.json?.classes?.[0];
  if (firstClass) expectStatus("GET /api/classes/:name/:version", await call("GET", `/api/classes/${firstClass.slug}/latest`, { auth: "", pattern: "/api/classes/:name/:version" }), 200);
  expectStatus("GET /api/categories", await call("GET", "/api/categories", { auth: "", pattern: "/api/categories" }), 200);
  const session = await call("GET", "/api/auth/session", { auth: "" });
  record(session.status === 200 && session.json === null, "GET /api/auth/session answers null for a visitor", `${session.status} ${session.text.slice(0, 80)}`);
}

async function keyedChecks() {
  const me = await call("GET", "/api/dev/me");
  expectStatus("GET /api/dev/me", me, 200);
  expectKeys("me shape", me.json, ["developer", "authVia", "scope", "termsVersion", "secrets"]);
  record(me.json?.authVia === "key", "me says the key is in use", me.json?.authVia);
  if (me.json?.scope !== "manage") {
    record(false, "the key has manage scope", `scope is ${me.json?.scope}; the walk needs a manage key`);
    return;
  }
  expectKeys("me.secrets shape", me.json.secrets, ["github", "githubSavedAt"]);
  const { slug, displayName } = me.json.developer;
  const same = await call("PUT", "/api/dev/me", { body: { slug, displayName } });
  expectStatus("PUT /api/dev/me with the current values", same, 200);
  record(same.json?.developer?.slug === slug && same.json?.developer?.displayName === displayName, "the profile is unchanged");

  for (const kind of ["recipes", "components"]) {
    const mine = await call("GET", `/api/dev/${kind}`);
    expectStatus(`GET /api/dev/${kind}`, mine, 200);
    record(Array.isArray(mine.json?.[kind]), `${kind} of mine is a list`);
    // An empty entry is refused before anything is stored or GitHub is asked.
    expectStatus(`POST /api/dev/${kind} refuses an empty entry`, await call("POST", `/api/dev/${kind}`, { body: {} }), 400);
  }
  expectStatus("POST /api/dev/classes refuses an empty entry", await call("POST", "/api/dev/classes", { body: {} }), 400);

  const keys = await call("GET", "/api/dev/keys");
  expectStatus("GET /api/dev/keys", keys, 200);
  const k = keys.json?.keys?.[0];
  record(Array.isArray(keys.json?.keys) && k && !("keyHash" in k) && "prefix" in k, "keys list prefixes, never hashes");
  expectStatus("GET /api/dev/audit", await call("GET", "/api/dev/audit"), 200);

  // Browser-only actions must refuse a key.
  for (const [method, path, body] of [["POST", "/api/dev/keys", { name: "x" }], ["PUT", "/api/dev/secrets", {}], ["DELETE", "/api/dev/me", {}], ["POST", "/api/dev/keys/revoke-all", undefined]]) {
    expectStatus(`${method} ${path} refuses an API key`, await call(method, path, { body }), 403);
  }
}

// Every GET route agents.md lists, except those that need a published entry when the catalogue is empty; writes are
// not walked because the check changes nothing.
function coverage() {
  const normalise = (e) => e.replace(/:[a-zA-Z]+/g, ":id").replace(/<[a-z]+>/g, ":id");
  const done = new Set([...exercised].map(normalise));
  const documented = documentedEndpoints().filter((e) => e.startsWith("GET ")).map(normalise);
  const notWalked = documented.filter((e) => !done.has(e) && !(/:id\/(:id|latest)/.test(e) || /\/reports$/.test(e)));
  record(notWalked.length === 0, "every GET route agents.md lists was called", notWalked.join(", "));
}

console.log(`ClodHub live check against ${base}${key ? "" : " (public part only; set CLODHUB_API_KEY for the rest)"}`);
await publicChecks();
if (key) {
  await keyedChecks();
  coverage();
}
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
