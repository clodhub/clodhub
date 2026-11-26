// Channels, images, classes and categories, quality, vulnerabilities and downloads in the catalogue.
import { beforeEach, describe, expect, it } from "vitest";
import { crc32, EXAMPLE_BUNDLE_DIGEST, EXAMPLE_IMAGE, EXAMPLE_IMAGE_BYTES, descriptorDigest, exampleCategories, exampleClassEntries, exampleComponentEntries, exampleComponentEntry, pngHeader, webpHeader, type ClassList, type ClassVersionView, type ComponentList, type ComponentVersionView, type RecipeList, type VulnerabilityReport } from "@clodhub/shared";
import { CatalogueDb } from "../src/catalogue-db.js";
import type { Env } from "../src/env.js";
import { handle, scheduled } from "../src/index.js";
import { BASE, GH_TOKEN, api, clearDb, fakeFetch, gh, jsonRes, signIn, testDeps, testEnv, type Call, type TestDeps } from "./helpers.js";

type Mutable = Record<string, any>;

let env: Env;
let deps: TestDeps;
let cookie: string;
let osvCalls: Call[];
let member = true;

function release(repo: string, tag: string, asset: string, id: number) {
  return {
    [`GET ${gh(`/repos/${repo}`)}`]: () => jsonRes({ permissions: { push: true } }),
    [`GET ${gh(`/repos/${repo}/releases/tags/${tag}`)}`]: () => jsonRes({ assets: [{ name: asset, url: `https://api.github.com/repos/${repo}/releases/assets/${id}`, digest: EXAMPLE_BUNDLE_DIGEST }] }),
  };
}

// GitHub releases for every version used here, and OSV answering one advisory for left-pad 1.3.0.
function stubs() {
  const routes: Record<string, (call: Call) => Response | Promise<Response>> = {
    "POST api.osv.dev/v1/querybatch": async (call) => {
      const { queries } = JSON.parse(call.body!) as { queries: { package: { purl: string } }[] };
      if (queries.some((q) => q.package.purl.startsWith("pkg:generic/unreadable"))) return new Response(JSON.stringify({ code: 3, message: "Invalid query" }), { status: 400 });
      // OSV answers a scoped npm package the same in both forms, as the live service does.
      const babel = ["pkg:npm/@babel/traverse@7.23.0", "pkg:npm/%40babel/traverse@7.23.0"];
      return jsonRes({ results: queries.map((q) => (q.package.purl === "pkg:npm/left-pad@1.3.0" ? { vulns: [{ id: "GHSA-aaaa-bbbb-cccc", modified: "2026-11-01T00:00:00Z" }] } : babel.includes(q.package.purl) ? { vulns: [{ id: "GHSA-67hx-6x53-jw92", modified: "2026-09-10T03:50:03Z" }] } : {})) });
    },
    "GET api.osv.dev/v1/vulns/GHSA-67hx-6x53-jw92": () => jsonRes({ id: "GHSA-67hx-6x53-jw92", summary: "Babel vulnerable to arbitrary code execution", modified: "2026-09-10T03:50:03Z", database_specific: { severity: "CRITICAL" }, affected: [{ package: { name: "@babel/traverse", ecosystem: "npm", purl: "pkg:npm/%40babel/traverse" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "7.23.2" }] }] }, { package: { name: "babel-traverse", ecosystem: "npm", purl: "pkg:npm/babel-traverse" }, ranges: [{ events: [{ introduced: "0" }] }] }] }),
    "GET api.osv.dev/v1/vulns/GHSA-aaaa-bbbb-cccc": () => jsonRes({ id: "GHSA-aaaa-bbbb-cccc", summary: "Prototype pollution in left-pad", modified: "2026-11-01T00:00:00Z", database_specific: { severity: "HIGH" }, affected: [{ package: { purl: "pkg:npm/left-pad" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "1.3.1" }] }] }] }),
  };
  for (const [i, v] of ["0.1.0", "0.1.1", "0.1.2", "0.2.0", "0.3.0-preview.1", "1.0.0", "2.0.0", "3.0.0", "4.0.0", "5.0.0", "6.0.0", "7.0.0"].entries()) Object.assign(routes, release("acme/card-deck", `v${v}`, `card-deck-${v}.tar`, 10 + i));
  for (const [i, part] of exampleComponentEntries().entries()) Object.assign(routes, release(part.source.repository, part.source.tag, part.bundle.asset, 50 + i));
  Object.assign(routes, release("acme/poker-night-recipe", "v0.1.0", "poker-night-recipe-0.1.0.tar", 21));
  routes[`GET ${gh("/user/memberships/orgs/clodhub")}`] = () => (member ? jsonRes({ state: "active" }) : new Response("not a member", { status: 404 }));
  routes[`GET ${gh("/user/memberships/orgs/acme")}`] = () => jsonRes({ state: "active" });
  const stub = fakeFetch(routes);
  osvCalls = stub.calls;
  return stub.fetch;
}

const hexOf = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

async function upload(bytes: Uint8Array, type = "image/png", address?: string, c: string | null = cookie) {
  const headers: Record<string, string> = { "Content-Type": type, Origin: BASE };
  if (c) headers.Cookie = c;
  return handle(new Request(`${BASE}/api/dev/images/${address ?? (await hexOf(bytes))}`, { method: "PUT", headers, body: bytes }), env, deps);
}

const get = (path: string) => handle(api(null, "GET", path), env, deps);
const post = (path: string, body: unknown, c: string | null = cookie) => handle(api(c, "POST", path, body), env, deps);
const digest = (c: string) => `sha256:${c.repeat(64)}`;

function card(version: string, patch: (e: Mutable) => void = () => {}): Mutable {
  const e = structuredClone(exampleComponentEntry()) as unknown as Mutable;
  e.version = version;
  e.digest = digest(String(version.replace(/\D/g, "").slice(-1) || "a"));
  e.source.tag = `v${version}`;
  e.bundle.asset = `card-deck-${version}.tar`;
  patch(e);
  return e;
}

// The example classes, published as the publish tool does before any component.
async function publishClasses() {
  for (const c of exampleClassEntries()) expect([200, 201]).toContain((await post("/api/dev/classes", c)).status);
}

async function publish(e: Mutable) {
  await publishClasses();
  const res = await post("/api/dev/components", e);
  expect(res.status, await res.clone().text()).toBe(201);
}

beforeEach(async () => {
  member = true;
  env = testEnv({ CATALOGUE_CURATORS: "42" });
  await clearDb(env);
  deps = testDeps(stubs());
  cookie = await signIn(env, deps);
  expect((await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps)).status).toBe(200);
  expect((await post("/api/dev/categories", exampleCategories())).status).toBe(200);
  expect((await upload(EXAMPLE_IMAGE_BYTES.image)).status).toBe(201);
  expect((await upload(EXAMPLE_IMAGE_BYTES.thumbnail, "image/webp")).status).toBe(201);
});

describe("images", () => {
  it("stores an image by its sha256 after checking the bytes, and serves it for a year", async () => {
    const bytes = pngHeader(640, 400);
    const res = await upload(bytes);
    expect(res.status).toBe(201);
    const hex = await hexOf(bytes);
    expect(await res.json()).toEqual({ status: "stored", digest: `sha256:${hex}`, type: "png", width: 640, height: 400, bytes: bytes.length, url: `${BASE}/images/${hex}.png` });
    expect(((await (await upload(bytes)).json()) as { status: string }).status).toBe("unchanged");
    const served = await get(`/images/${hex}.png`);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
    expect((await get(`/images/${hex}.webp`)).status).toBe(404);
    expect((await get(`/images/${"0".repeat(64)}.png`)).status).toBe(404);
  });

  it("refuses a wrong sha256, a type that does not match the bytes, an oversized image and a visitor", async () => {
    const bytes = pngHeader(10, 10);
    expect((await upload(bytes, "image/png", "1".repeat(64))).status).toBe(422);
    expect((await upload(bytes, "image/webp")).status).toBe(422);
    expect((await upload(new TextEncoder().encode("<svg/>"), "image/svg+xml")).status).toBe(415);
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(pngHeader(10, 10));
    expect((await upload(big)).status).toBe(413);
    expect((await upload(webpHeader(20, 10), "image/webp")).status).toBe(201);
    expect((await upload(pngHeader(11, 11), "image/png", undefined, null)).status).toBe(401);
  });

  it("puts the main thumbnail on cards and the gallery on the version", async () => {
    await publish(card("0.1.0"));
    const list = (await (await get("/api/components")).json()) as ComponentList;
    expect(list.components[0]!.thumbnail).toBe(`${BASE}/images/${EXAMPLE_IMAGE.thumbnail.slice(7)}.webp`);
    const v = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(v.images[0]).toMatchObject({ url: `${BASE}/images/${EXAMPLE_IMAGE.digest.slice(7)}.png`, width: 1280, height: 800, platform: "web" });
  });
});

describe("release channels", () => {
  it("shows each version's channel and fixes, and the security releases on the shown line", async () => {
    await publish(card("0.1.0"));
    await publish(card("0.1.1", (e) => (e.release = { channel: "security", fixes: ["GHSA-aaaa-bbbb-cccc"] })));
    await publish(card("0.2.0"));
    await publish(card("0.3.0-preview.1", (e) => (e.release = { channel: "preview", fixes: [] })));
    const latest = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(latest.version).toBe("0.2.0");
    expect(latest.versions.map((v) => [v.version, v.channel, v.fixes])).toEqual([
      ["0.3.0-preview.1", "preview", []],
      ["0.2.0", "features", []],
      ["0.1.1", "security", ["GHSA-aaaa-bbbb-cccc"]],
      ["0.1.0", "features", []],
    ]);
    const old = (await (await get("/api/components/card-deck/0.1.0")).json()) as ComponentVersionView;
    expect(old.release).toEqual({ channel: "features", fixes: [] });
    expect(old.line).toEqual({ line: "0.1", securityReleases: [{ version: "0.1.1", fixes: ["GHSA-aaaa-bbbb-cccc"], publishedAt: deps.now().toISOString() }] });
    expect(((await (await get("/api/components/card-deck/0.3.0-preview.1")).json()) as ComponentVersionView).release.channel).toBe("preview");
    const text = await (await get("/components/card-deck.txt?version=0.1.0")).text();
    expect(text).toContain("Line 0.1: security releases 0.1.1 (fixes GHSA-aaaa-bbbb-cccc)");
    expect(text).toContain("- 0.1.1 security (fixes GHSA-aaaa-bbbb-cccc)");
    expect(((await (await get("/api/components?channel=features")).json()) as ComponentList).components).toHaveLength(1);
  });

  it("refuses a channel that does not match the version", async () => {
    const error = async (e: Mutable) => ((await (await post("/api/dev/components", e)).json()) as { error: string }).error;
    expect(await error(card("0.1.1"))).toContain("release.channel features needs patch 0");
    expect(await error(card("0.2.0", (e) => (e.release = { channel: "security", fixes: ["GHSA-aaaa-bbbb-cccc"] })))).toContain("release.channel security needs a patch above 0");
    expect(await error(card("0.1.1", (e) => (e.release = { channel: "security", fixes: [] })))).toContain("release.fixes must list the advisories");
    expect(await error(card("0.3.0", (e) => (e.release = { channel: "preview", fixes: [] })))).toContain("preview needs a pre-release version");
    expect(await error(card("0.1.0", (e) => (e.format = 1)))).toContain("format-refused");
  });

  it("lists a preview only while nothing else is listed", async () => {
    await publish(card("0.3.0-preview.1", (e) => (e.release = { channel: "preview", fixes: [] })));
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).version).toBe("0.3.0-preview.1");
    await publish(card("0.1.0"));
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).version).toBe("0.1.0");
  });
});

describe("classes and categories", () => {
  it("publishes a class, lists classes by category and compares its implementations", async () => {
    const [deckClass] = exampleClassEntries();
    const res = await post("/api/dev/classes", deckClass);
    const classDigest = descriptorDigest(deckClass!.class);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "published", name: "pkg:clod/com.clodhub/card-deck-class", version: "1.0.0", digest: `sha256:${classDigest}`, url: `${BASE}/classes/card-deck-class` });
    expect(((await (await post("/api/dev/classes", deckClass)).json()) as { status: string }).status).toBe("unchanged");
    await publish(card("0.1.0", (e) => (e.quality = { level: "reviewed", certified: true, liveTested: null })));
    const list = (await (await get("/api/classes?category=games")).json()) as ClassList;
    expect(list.classes.map((c) => [c.name, c.category, c.implementations])).toEqual([["pkg:clod/com.clodhub/card-deck-class", "games/cards", 1], ["pkg:clod/com.clodhub/seating-class", "games/tables", 0]]);
    const view = (await (await get("/api/classes/card-deck-class")).json()) as ClassVersionView;
    expect(view).toMatchObject({ title: "Card deck", summary: "A deck that shuffles, deals and burns cards", category: "games/cards", presentation: "visual", digest: classDigest });
    expect(view.suites.map((s) => s.id)).toEqual(["behaviour"]);
    expect(view.implementationList).toEqual([expect.objectContaining({ name: "pkg:clod/io.github.acme/card-deck", version: "0.1.0", quality: { level: "reviewed", certified: true, liveTested: null }, thumbnail: `${BASE}/images/${EXAMPLE_IMAGE.thumbnail.slice(7)}.webp`, platforms: ["web", "server", "ios", "macos", "android"] })]);
    const tree = (await (await get("/api/categories")).json()) as { categories: { id: string; classes: number; components: number }[] };
    expect(tree.categories.filter((c) => c.id.startsWith("games")).map((c) => [c.id, c.classes, c.components])).toEqual([["games", 2, 1], ["games/cards", 1, 1], ["games/tables", 1, 0]]);
    const text = await (await get("/classes/card-deck-class.txt")).text();
    expect(text).toContain("Card deck (pkg:clod/com.clodhub/card-deck-class) 1.0.0");
    expect(text).toContain("- pkg:clod/io.github.acme/card-deck 0.1.0: A shuffled deck");
    expect(await (await get("/classes.txt")).text()).toContain("- Card deck (pkg:clod/com.clodhub/card-deck-class) 1.0.0");
  });

  it("refuses a class without its catalogue fields, outside the tree, or changed under the same version", async () => {
    const [deckClass] = exampleClassEntries() as Mutable[];
    const without = structuredClone(deckClass!);
    delete without.class.presentation;
    expect(((await (await post("/api/dev/classes", without)).json()) as { error: string }).error).toContain("class-fields");
    const elsewhere = structuredClone(deckClass!);
    elsewhere.class.category = "music/drums";
    expect(((await (await post("/api/dev/classes", elsewhere)).json()) as { error: string }).error).toContain("not in the category tree");
    expect((await post("/api/dev/classes", deckClass)).status).toBe(201);
    const changed = structuredClone(deckClass!);
    changed.class.summary = "Something else";
    expect((await post("/api/dev/classes", changed)).status).toBe(409);
    expect(descriptorDigest(changed.class)).not.toBe(descriptorDigest(deckClass!.class));
  });

  it("refuses a component descriptor without the class fields", async () => {
    const e = card("0.1.0", (x) => delete x.foundations.classes[0].descriptor.title);
    expect(((await (await post("/api/dev/components", e)).json()) as { error: string }).error).toContain("class-fields");
  });

  it("lets only a curator publish categories, and checks parents", async () => {
    env.CATALOGUE_CURATORS = "";
    expect((await post("/api/dev/categories", exampleCategories())).status).toBe(403);
    env.CATALOGUE_CURATORS = "42";
    const orphan = await post("/api/dev/categories", { format: 1, categories: [{ id: "music/drums", title: "Drums", parent: "music" }] });
    expect(((await orphan.json()) as { error: string }).error).toContain("parent music is not in the tree");
    expect((await post("/api/dev/categories", { categories: [] })).status).toBe(400);
    const more = await post("/api/dev/categories", { format: 1, categories: [{ id: "music", title: "Music", parent: null }, { id: "music/drums", title: "Drums", parent: "music" }, { id: "games", title: "Games and play", parent: null }] });
    expect(await more.json()).toMatchObject({ added: ["music", "music/drums"], renamed: ["games"] });
  });
});

describe("vulnerabilities", () => {
  const withPad = (version: string, patch: (e: Mutable) => void = () => {}) =>
    card(version, (e) => {
      e.foundations.upstream = [{ name: "left-pad", version: "1.3.0", repository: "https://github.com/left-pad/left-pad", purl: "pkg:npm/left-pad@1.3.0", licence: "MIT", notices: ["src/index.mjs"], revision: "e".repeat(40), delivery: { kind: "bundled", files: [{ path: "src/index.mjs", digest: "d".repeat(64) }] } }];
      patch(e);
    });

  it("checks each purl at OSV in one batch, stores the advisories and counts them per version", async () => {
    await publish(withPad("0.1.0"));
    await publish(card("0.2.0"));
    const before = (await (await get("/api/components/card-deck/0.1.0/vulnerabilities")).json()) as VulnerabilityReport;
    expect(before).toEqual({ name: "pkg:clod/io.github.acme/card-deck", version: "0.1.0", checkedAt: null, count: null, advisories: [], unqueryable: [] });
    await scheduled("7 * * * *", env, deps);
    const batch = osvCalls.filter((c) => c.url.endsWith("/v1/querybatch"));
    expect(batch).toHaveLength(1);
    expect(JSON.parse(batch[0]!.body!)).toEqual({ queries: [{ package: { purl: "pkg:npm/left-pad@1.3.0" } }] });
    const after = (await (await get("/api/components/card-deck/0.1.0/vulnerabilities")).json()) as VulnerabilityReport;
    expect(after).toEqual({ name: "pkg:clod/io.github.acme/card-deck", version: "0.1.0", checkedAt: deps.now().toISOString(), count: 1, advisories: [{ id: "GHSA-aaaa-bbbb-cccc", summary: "Prototype pollution in left-pad", severity: "HIGH", affected: ["pkg:npm/left-pad@1.3.0"], fixedIn: ["1.3.1"], waived: null }], unqueryable: [] });
    expect(((await (await get("/api/components/card-deck/0.1.0")).json()) as ComponentVersionView).vulnerabilitySummary.count).toBe(1);
    expect(((await (await get("/api/components/card-deck/0.2.0/vulnerabilities")).json()) as VulnerabilityReport).count).toBe(0);
    osvCalls.length = 0;
    await scheduled("7 * * * *", env, deps);
    expect(osvCalls).toHaveLength(0);
    deps.advance(25 * 3600 * 1000);
    await scheduled("7 * * * *", env, deps);
    expect(osvCalls.map((c) => c.url)).toEqual(["https://api.osv.dev/v1/querybatch"]);
  });

  it("checks a scoped npm package written canonically (%40) or with @, and gives the fixed version for both", async () => {
    const babel = (version: string, purl: string) => card(version, (e) => (e.foundations.upstream = [{ name: "@babel/traverse", version: "7.23.0", repository: "https://github.com/babel/babel", purl, licence: "MIT", notices: ["src/index.mjs"], revision: "e".repeat(40), delivery: { kind: "bundled", files: [{ path: "src/index.mjs", digest: "d".repeat(64) }] } }]));
    await publish(babel("0.1.0", "pkg:npm/%40babel/traverse@7.23.0"));
    await publish(babel("0.2.0", "pkg:npm/@babel/traverse@7.23.0"));
    await scheduled("7 * * * *", env, deps);
    for (const [version, purl] of [["0.1.0", "pkg:npm/%40babel/traverse@7.23.0"], ["0.2.0", "pkg:npm/@babel/traverse@7.23.0"]]) {
      const report = (await (await get(`/api/components/card-deck/${version}/vulnerabilities`)).json()) as VulnerabilityReport;
      expect(report, version).toMatchObject({ count: 1, advisories: [{ id: "GHSA-67hx-6x53-jw92", affected: [purl], fixedIn: ["7.23.2"] }], unqueryable: [] });
    }
  });

  it("refuses a malformed purl at publish", async () => {
    const res = await post("/api/dev/components", withPad("0.1.0", (e) => (e.foundations.upstream[0].purl = "pkg:npm/@1.3.0")));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("upstream-provenance");
  });

  it("finds the purl OSV refuses by halving the batch, marks it unqueryable and checks the rest", async () => {
    await publish(withPad("0.1.0"));
    await publish(withPad("0.2.0", (e) => {
      e.foundations.upstream.push({ ...e.foundations.upstream[0], name: "unreadable", version: "1.0", purl: "pkg:generic/unreadable@1.0" });
    }));
    for (let i = 0; i < 6; i++) await publish(withPad(`${i + 1}.0.0`, (e) => (e.foundations.upstream = [{ ...e.foundations.upstream[0], name: `lib${i}`, version: "2.0.0", purl: `pkg:npm/lib${i}@2.0.0` }])));
    const result = await scheduled("7 * * * *", env, deps);
    void result;
    expect(osvCalls.filter((c) => c.url.endsWith("/v1/querybatch")).length).toBeGreaterThan(2);
    const good = (await (await get("/api/components/card-deck/0.1.0/vulnerabilities")).json()) as VulnerabilityReport;
    expect(good.count).toBe(1);
    const bad = (await (await get("/api/components/card-deck/0.2.0/vulnerabilities")).json()) as VulnerabilityReport;
    expect(bad).toMatchObject({ count: null, unqueryable: ["pkg:generic/unreadable@1.0"] });
    expect(bad.checkedAt).not.toBeNull();
    expect(((await (await get("/api/components/card-deck/4.0.0/vulnerabilities")).json()) as VulnerabilityReport).count).toBe(0);
    expect(await (await get("/components/card-deck.txt?version=0.2.0")).text()).toContain("Known vulnerabilities: unknown: OSV could not check one of its package URLs");
    osvCalls.length = 0;
    await scheduled("7 * * * *", env, deps);
    expect(osvCalls).toHaveLength(0);
  });

  it("checks every other version in the same run when one version holds many purls OSV refuses, and never mixes it again", async () => {
    await publish(withPad("0.1.0"));
    const bad = Array.from({ length: 40 }, (_, i) => `pkg:generic/unreadable-${i}@1.0`);
    await publish(withPad("0.2.0", (e) => {
      const pad = e.foundations.upstream[0];
      e.foundations.upstream = [pad, ...bad.map((purl, i) => ({ ...pad, name: `unreadable-${i}`, version: "1.0", purl })), { ...pad, name: "only-here", version: "1.0.0", purl: "pkg:npm/only-here@1.0.0" }];
    }));
    for (let i = 0; i < 6; i++) await publish(withPad(`${i + 1}.0.0`, (e) => (e.foundations.upstream = [{ ...e.foundations.upstream[0], name: `lib${i}`, version: "2.0.0", purl: `pkg:npm/lib${i}@2.0.0` }])));
    osvCalls.length = 0;
    await scheduled("7 * * * *", env, deps);
    const perRun = () => osvCalls.filter((c) => c.url.endsWith("/v1/querybatch")).length;
    expect(perRun()).toBeLessThanOrEqual(40);
    for (let i = 1; i <= 6; i++) expect(((await (await get(`/api/components/card-deck/${i}.0.0/vulnerabilities`)).json()) as VulnerabilityReport).count).toBe(0);
    for (let run = 0; run < 2; run++) {
      deps.advance(3_600_000);
      osvCalls.length = 0;
      await scheduled("7 * * * *", env, deps);
      expect(perRun()).toBeLessThanOrEqual(40);
    }
    const batches = () => osvCalls.filter((c) => c.url.endsWith("/v1/querybatch")).map((c) => (JSON.parse(c.body!) as { queries: { package: { purl: string } }[] }).queries.map((q) => q.package.purl));
    const report = async (v: string) => (await (await get(`/api/components/card-deck/${v}/vulnerabilities`)).json()) as VulnerabilityReport;
    expect((await report("0.1.0")).count).toBe(1);
    for (let i = 1; i <= 6; i++) expect((await report(`${i}.0.0`)).count).toBe(0);
    const held = await report("0.2.0");
    expect(held.count).toBeNull();
    expect(held.checkedAt).not.toBeNull();
    expect(held.unqueryable.length).toBeGreaterThan(0);
    // The version's requests ran out before only-here had an answer: it is unknown for this version alone. A version
    // published later with the same purl is checked as usual.
    expect(held.unqueryable).toContain("pkg:npm/only-here@1.0.0");
    expect(await env.DB.prepare("SELECT unqueryable FROM purls WHERE purl = 'pkg:npm/only-here@1.0.0'").first()).toEqual({ unqueryable: 0 });
    await publish(withPad("7.0.0", (e) => (e.foundations.upstream = [{ ...e.foundations.upstream[0], name: "only-here", version: "1.0.0", purl: "pkg:npm/only-here@1.0.0" }])));
    await scheduled("7 * * * *", env, deps);
    expect(await report("7.0.0")).toMatchObject({ count: 0, unqueryable: [] });
    const proven = (await env.DB.prepare("SELECT purl FROM purls WHERE unqueryable = 1").all<{ purl: string }>()).results.map((r) => r.purl);
    expect(proven.length).toBeGreaterThan(0);
    deps.advance(86_400_000 + 1000);
    osvCalls.length = 0;
    await scheduled("7 * * * *", env, deps);
    expect(batches().flat().filter((x) => proven.includes(x))).toEqual([]);
    const alone = async (v: string) => (await env.DB.prepare("SELECT osv_alone FROM component_versions WHERE version = ?").bind(v).first<{ osv_alone: number }>())!.osv_alone;
    expect(await alone("0.2.0")).toBe(1);
    expect(await alone("1.0.0")).toBe(0);
  });

  it("filters to no known vulnerabilities on the newest version, and does not count a waived advisory", async () => {
    await publish(withPad("0.1.0"));
    await scheduled("7 * * * *", env, deps);
    const names = async (q: string) => ((await (await get(`/api/components?${q}`)).json()) as ComponentList).components.map((c) => c.name);
    expect(await names("secure=true")).toEqual([]);
    await publish(withPad("0.2.0", (e) => (e.vulnerabilityWaivers = [{ id: "GHSA-aaaa-bbbb-cccc", reason: "the padding function is not reachable from the deck" }])));
    expect(((await (await get("/api/components/card-deck/0.2.0/vulnerabilities")).json()) as VulnerabilityReport).advisories[0]!.waived).toBe("the padding function is not reachable from the deck");
    expect(((await (await get("/api/components/card-deck/0.2.0")).json()) as ComponentVersionView).vulnerabilitySummary.count).toBe(0);
    expect(await names("secure=true")).toEqual(["pkg:clod/io.github.acme/card-deck"]);
  });
});

describe("downloads and trending", () => {
  it("counts each download link per version and day, and sorts by downloads and trending", async () => {
    for (const part of exampleComponentEntries()) await publish(part as unknown as Mutable);
    const bundle = (slug: string, address = "203.0.113.1") => handle(new Request(`${BASE}/api/components/${slug}/0.1.0/bundle`, { headers: { "CF-Connecting-IP": address } }), env, deps);
    for (let i = 0; i < 3; i++) await bundle("seating", `203.0.113.${i + 1}`);
    await bundle("seating", "203.0.113.1");
    await bundle("guided-tour");
    expect(((await (await get("/api/components/seating")).json()) as ComponentVersionView).versionDownloads).toBe(3);
    const seen = (await env.DB.prepare("SELECT visitor FROM downloads_seen").all<{ visitor: string }>()).results.map((r) => r.visitor);
    expect(seen).toHaveLength(4);
    expect(seen.every((v) => /^[0-9a-f]{64}$/.test(v))).toBe(true);
    const top = async (sort: string) => ((await (await get(`/api/components?sort=${sort}&limit=2`)).json()) as ComponentList).components.map((c) => [c.name, c.downloads]);
    expect(await top("downloads")).toEqual([["pkg:clod/io.github.acme/seating", 3], ["pkg:clod/io.github.acme/guided-tour", 1]]);
    deps.advance(10 * 86_400_000);
    await bundle("guided-tour");
    await scheduled("7 * * * *", env, deps);
    expect(await top("trending")).toEqual([["pkg:clod/io.github.acme/guided-tour", 2], ["pkg:clod/io.github.acme/apple-host", 0]]);
    expect(await top("downloads")).toEqual([["pkg:clod/io.github.acme/seating", 3], ["pkg:clod/io.github.acme/guided-tour", 2]]);
    deps.advance(30 * 86_400_000);
    await new CatalogueDb(env.DB).refreshDownloads(deps.now().toISOString().slice(0, 10));
    expect(((await (await get("/api/components/seating")).json()) as ComponentVersionView).downloads).toBe(0);
  });
});

describe("download refresh in chunks", () => {
  it("refreshes a bounded number of entries per statement and resumes on the next run", async () => {
    for (const part of exampleComponentEntries()) await publish(part as unknown as Mutable);
    const d = new CatalogueDb(env.DB);
    const today = deps.now().toISOString().slice(0, 10);
    const ids = (await env.DB.prepare("SELECT id FROM components ORDER BY seq").all<{ id: string }>()).results.map((r) => r.id);
    for (const id of ids) await env.DB.prepare("INSERT INTO downloads_daily (kind, entry_id, version, day, n) VALUES ('component', ?, '0.1.0', ?, 2)").bind(id, today).run();
    await env.DB.prepare("UPDATE components SET downloads = 0").run();
    expect(await d.refreshDownloads(today, 1, 2)).toEqual({ chunks: 1, done: false });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM components WHERE downloads = 2").first<{ n: number }>())!.n).toBe(2);
    expect(await env.DB.prepare("SELECT pass, after, done FROM job_progress WHERE job = 'downloads-component'").first()).toMatchObject({ pass: today, done: 0 });
    expect((await d.refreshDownloads(today, 10, 2)).done).toBe(true);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM components WHERE downloads = 2").first<{ n: number }>())!.n).toBe(ids.length);
    expect(await d.refreshDownloads(today, 10, 2)).toEqual({ chunks: 0, done: true });
  });
});

describe("listing at scale", () => {
  it("reads about one page of rows for a listing and gives an exact total below the cap", async () => {
    for (const part of exampleComponentEntries()) await publish(part as unknown as Mutable);
    const res = await get("/api/components?limit=2&sort=name");
    const rows = Number(res.headers.get("X-D1-Rows-Read"));
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(60);
    expect(((await res.json()) as ComponentList).total).toEqual({ count: 5, approximate: false });
    expect(((await (await get("/api/recipes")).json()) as RecipeList).total).toEqual({ count: 0, approximate: false });
  });
});

describe("review fixes", () => {
  it("lets only the namespace's owner and its members publish classes, each class staying with its first publisher", async () => {
    const [deckClass] = exampleClassEntries() as Mutable[];
    member = false;
    const refused = await post("/api/dev/classes", deckClass);
    expect(refused.status).toBe(403);
    const error = ((await refused.json()) as { error: string }).error;
    expect(error).toContain("publish in com.clodhub as clodhub or as an active member of the clodhub organisation");
    expect(error).toContain("Authorized OAuth Apps, ClodHub, Grant");
    member = true;
    expect((await post("/api/dev/classes", deckClass)).status).toBe(201);
    const sue = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    expect((await handle(api(sue, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps)).status).toBe(200);
    const next = structuredClone(deckClass!);
    next.class.version = "1.1.0";
    const res = await post("/api/dev/classes", next, sue);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("belongs to another developer");
    const another = structuredClone(deckClass!);
    another.class.name = "pkg:clod/com.clodhub/another-class";
    expect((await post("/api/dev/classes", another, sue)).status).toBe(201);
  });

  it("asks GitHub for read:org at sign-in, records the organisations, and says to sign in again when the token cannot read them", async () => {
    const start = await handle(new Request(`${BASE}/api/auth/github`), env, deps);
    expect(new URL(start.headers.get("Location")!).searchParams.get("scope")).toBe("read:user read:org");
    const [deckClass] = exampleClassEntries() as Mutable[];
    const scopeless = fakeFetch({ [`GET ${gh("/user/memberships/orgs/clodhub")}`]: () => new Response(JSON.stringify({ message: "You need at least read:org scope" }), { status: 403 }) });
    const refused = await handle(api(cookie, "POST", "/api/dev/classes", deckClass), env, { ...deps, fetch: scopeless.fetch });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toBe("the saved GitHub token cannot read organisation membership; sign in to clodhub.com again");
    member = false;
    const sue = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" }, true, ["clodhub"]);
    const res = await post("/api/dev/classes", deckClass, sue);
    expect(res.status, await res.clone().text()).toBe(201);
    expect(await env.DB.prepare("SELECT orgs FROM developer_orgs d JOIN developers v ON v.id = d.developer_id WHERE v.github_login = 'sue'").first()).toEqual({ orgs: '["clodhub"]' });
  });

  it("answers 400 for a value outside a closed facet or a malformed one, and an empty page for an unmatched open value", async () => {
    await publish(card("0.1.0"));
    for (const query of ["platform=linux", "licence=not%20a%20licence", "quality=gold", "certified=maybe", "channel=beta", "secure=sometimes", "sort=random", "deprecated=never", "category=Music!", "class=not-a-class", "publisher=No%20Body", "provides=bad%20type", "requires=bad%20type"]) {
      expect((await get(`/api/components?${query}`)).status, query).toBe(400);
    }
    for (const query of ["category=music", "class=pkg:clod/io.github.acme/none-class", "publisher=nobody", "provides=com.clodhub/nothing-here", "requires=com.clodhub/nothing-here"]) {
      const res = await get(`/api/components?${query}`);
      expect(res.status, query).toBe(200);
      expect(((await res.json()) as ComponentList).components, query).toEqual([]);
    }
    for (const query of ["platform=tvos", "licence=MIT", "quality=reviewed", "channel=security", "category=games"]) expect((await get(`/api/components?${query}`)).status, query).toBe(200);
  });

  it("accepts only -preview.N previews and refuses a security release on a line without a features release", async () => {
    for (const v of ["0.3.0-preview.0", "0.3.0-beta.1", "0.3.0-preview.1.2", "0.3.0-preview"]) {
      const res = await post("/api/dev/components", card(v, (e) => (e.release = { channel: "preview", fixes: [] })));
      expect(res.status, v).toBe(400);
    }
    await publishClasses();
    const lonely = await post("/api/dev/components", card("0.1.1", (e) => (e.release = { channel: "security", fixes: ["GHSA-aaaa-bbbb-cccc"] })));
    expect(lonely.status).toBe(400);
    expect(((await lonely.json()) as { error: string }).error).toContain("no published features release on line 0.1");
  });

  it("refuses an image whose structure is incomplete or corrupt", async () => {
    const png = pngHeader(64, 64);
    const html = new Uint8Array(33 + 760_000);
    html.set(png.subarray(0, 33));
    html.fill(0x3c, 33);
    expect((await upload(html)).status).toBe(422);
    expect((await upload(png.subarray(0, png.length - 12))).status).toBe(422);
    const badCrc = png.slice();
    badCrc[30] ^= 0xff;
    expect((await upload(badCrc)).status).toBe(422);
    const noIdat = png.slice();
    noIdat.set(new TextEncoder().encode("IDAX"), 37);
    expect((await upload(noIdat)).status).toBe(422);
    const webp = webpHeader(32, 16);
    const longer = new Uint8Array(webp.length + 8);
    longer.set(webp);
    expect((await upload(longer, "image/webp")).status).toBe(422);
    const short = webp.slice();
    new DataView(short.buffer).setUint32(16, 40, true);
    expect((await upload(short, "image/webp")).status).toBe(422);
    expect((await upload(png)).status).toBe(201);
    expect((await upload(webp, "image/webp")).status).toBe(201);
  });

  it("counts an unnamed image's day from its latest upload by anyone", async () => {
    const sue = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    const bytes = pngHeader(6, 6);
    const hex = await hexOf(bytes);
    expect((await upload(bytes, "image/png", undefined, sue)).status).toBe(201);
    deps.advance(20 * 3_600_000);
    expect((await upload(bytes)).status).toBe(200);
    deps.advance(20 * 3_600_000);
    expect((await upload(bytes)).status).toBe(200);
    deps.advance(20 * 3_600_000);
    await scheduled("7 * * * *", env, deps);
    expect((await get(`/images/${hex}.png`)).status).toBe(200);
    deps.advance(5 * 3_600_000);
    await scheduled("7 * * * *", env, deps);
    expect((await get(`/images/${hex}.png`)).status).toBe(404);
  });

  it("says there is no saved token when a class publisher has neither a token nor a sign-in organisation list", async () => {
    await env.DB.prepare("DELETE FROM developer_secrets").run();
    await env.DB.prepare("DELETE FROM developer_orgs").run();
    const [deckClass] = exampleClassEntries() as Mutable[];
    const res = await post("/api/dev/classes", deckClass);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("there is no saved GitHub token and no organisation list from sign-in; sign in to clodhub.com again");
  });

  it("refuses images carrying more than 64 KB of metadata or chunks of unknown kinds", async () => {
    const png = pngHeader(8, 8);
    const chunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.length);
      const view = new DataView(out.buffer);
      view.setUint32(0, data.length);
      out.set(new TextEncoder().encode(type), 4);
      out.set(data, 8);
      view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
      return out;
    };
    const withText = (n: number) => {
      const text = chunk("tEXt", new Uint8Array(n).fill(0x41));
      const out = new Uint8Array(png.length + text.length);
      out.set(png.subarray(0, 33));
      out.set(text, 33);
      out.set(png.subarray(33), 33 + text.length);
      return out;
    };
    expect((await upload(withText(1000))).status).toBe(201);
    const big = await upload(withText(64 * 1024 + 1));
    expect(big.status).toBe(422);
    expect(((await big.json()) as { error: string }).error).toContain("metadata");
    const webp = webpHeader(8, 8);
    const riff = (extra: Uint8Array) => {
      const out = new Uint8Array(webp.length + extra.length);
      out.set(webp);
      out.set(extra, webp.length);
      new DataView(out.buffer).setUint32(4, out.length - 8, true);
      return out;
    };
    const webpChunk = (type: string, n: number) => {
      const out = new Uint8Array(8 + n + (n % 2));
      out.set(new TextEncoder().encode(type), 0);
      new DataView(out.buffer).setUint32(4, n, true);
      return out;
    };
    expect((await upload(riff(webpChunk("EXIF", 100)), "image/webp")).status).toBe(201);
    expect((await upload(riff(webpChunk("XMP ", 64 * 1024 + 2)), "image/webp")).status).toBe(422);
    expect((await upload(riff(webpChunk("JUNK", 100)), "image/webp")).status).toBe(422);
  });

  it("lets every developer who uploaded an image's bytes name it, even when someone else uploaded them first", async () => {
    const mallory = await signIn(env, deps, { id: 7, login: "mallory", name: "Mallory" });
    const front = pngHeader(1278, 800);
    const hex = await hexOf(front);
    expect((await upload(front, "image/png", undefined, mallory)).status).toBe(201);
    const mine = await upload(front);
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as { status: string }).status).toBe("unchanged");
    await publishClasses();
    const res = await post("/api/dev/components", card("0.1.0", (e) => (e.images[0] = { ...e.images[0], digest: `sha256:${hex}`, width: 1278 })));
    expect(res.status, await res.clone().text()).toBe(201);
  });

  it("lets only the uploader name an unclaimed image, removes images nobody named within a day, and limits uploads a day", async () => {
    const sue = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    const extra = pngHeader(1279, 800);
    const extraHex = await hexOf(extra);
    expect((await upload(extra, "image/png", undefined, sue)).status).toBe(201);
    await publishClasses();
    const borrowed = await post("/api/dev/components", card("0.1.0", (e) => (e.images[0] = { ...e.images[0], digest: `sha256:${extraHex}`, width: 1279 })));
    expect(borrowed.status).toBe(422);
    await publish(card("0.1.0"));
    deps.advance(86_400_000 + 1000);
    await scheduled("7 * * * *", env, deps);
    expect((await get(`/images/${extraHex}.png`)).status).toBe(404);
    expect((await get(`/images/${EXAMPLE_IMAGE.digest.slice(7)}.png`)).status).toBe(200);
    env.IMAGE_UPLOADS_PER_DAY = "2";
    expect((await upload(pngHeader(2, 2), "image/png", undefined, sue)).status).toBe(201);
    expect((await upload(pngHeader(3, 3), "image/png", undefined, sue)).status).toBe(201);
    expect((await upload(pngHeader(4, 4), "image/png", undefined, sue)).status).toBe(429);
  });

  it("orders a search with many matches by the chosen sort over all of them, and ranks relevance among the most downloaded", async () => {
    await publish(card("0.1.0"));
    const dev = (await env.DB.prepare("SELECT developer_id FROM components").first<{ developer_id: string }>())!.developer_id;
    // 1,200 lobby entries: the oldest is the most downloaded; the rest are newer with fewer downloads.
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1200)
       INSERT INTO components (id, name, namespace, slug, developer_id, repo, latest_version, created_at, updated_at, description, class_name, class_version, class_title, category, category_top, platforms, licence, channel, published_at, downloads)
       SELECT 'lobby' || i, 'pkg:clod/io.github.acme/lobby-' || i, 'acme', 'lobby-' || i, ?1, 'pkg:clod/io.github.acme/lobby-' || i, '0.1.0', '2026-10-01', '2026-10-01', 'A lobby for players', 'pkg:clod/com.clodhub/card-deck-class', '1.0.0', 'Card deck', 'games/cards', 'games', ' web ', 'MIT', 'features', '2026-10-01T00:00:00.000Z',
              CASE WHEN i = 1 THEN 100000 ELSE i END FROM n`,
    ).bind(dev).run();
    await env.DB.prepare("INSERT INTO component_fts (rowid, name, title, summary, class, tags) SELECT seq, name, class_title, description, class_name, '' FROM components WHERE slug LIKE 'lobby-%'").run();
    const first = async (query: string) => ((await (await get(`/api/components?${query}`)).json()) as ComponentList).components[0]?.name;
    expect(await first("q=lobby&sort=downloads")).toBe("pkg:clod/io.github.acme/lobby-1");
    expect(await first("q=lobby")).toBe("pkg:clod/io.github.acme/lobby-1");
    expect(await first("q=lobb&sort=downloads")).toBe("pkg:clod/io.github.acme/lobby-1");
    const page = (await (await get("/api/components?q=lobby&sort=downloads&limit=2")).json()) as ComponentList;
    expect(page.components.map((c) => c.name)).toEqual(["pkg:clod/io.github.acme/lobby-1", "pkg:clod/io.github.acme/lobby-1200"]);
    expect(page.total).toEqual({ count: 1200, approximate: false });
    const next = (await (await get(`/api/components?q=lobby&sort=downloads&limit=2&cursor=${page.next}`)).json()) as ComponentList;
    expect(next.components.map((c) => c.name)).toEqual(["pkg:clod/io.github.acme/lobby-1199", "pkg:clod/io.github.acme/lobby-1198"]);
    expect(await first("q=lobby&sort=name")).toBe("pkg:clod/io.github.acme/lobby-1");
  });

  it("orders a search with more matches than the dense limit by looking each listed row up, prefix written out", async () => {
    await publish(card("0.1.0"));
    const dev = (await env.DB.prepare("SELECT developer_id FROM components").first<{ developer_id: string }>())!.developer_id;
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 20500)
       INSERT INTO components (id, name, namespace, slug, developer_id, repo, latest_version, created_at, updated_at, description, class_name, class_version, class_title, category, category_top, platforms, licence, channel, published_at, downloads)
       SELECT 'lobby' || i, 'pkg:clod/io.github.acme/lobby-' || i, 'acme', 'lobby-' || i, ?1, 'pkg:clod/io.github.acme/lobby-' || i, '0.1.0', '2026-10-01', '2026-10-01', CASE WHEN i % 2 = 0 THEN 'A lobby for players' ELSE 'A lobbyist' END, 'pkg:clod/com.clodhub/card-deck-class', '1.0.0', 'Card deck', 'games/cards', 'games', ' web ', 'MIT', 'features', '2026-10-01T00:00:00.000Z',
              CASE WHEN i = 1 THEN 100000 ELSE i END FROM n`,
    ).bind(dev).run();
    await env.DB.prepare("INSERT INTO component_fts (rowid, name, title, summary, class, tags) SELECT seq, '', class_title, description, class_name, '' FROM components WHERE slug LIKE 'lobby-%'").run();
    const page = (await (await get("/api/components?q=lobb&sort=downloads&limit=3")).json()) as ComponentList;
    expect(page.components.map((c) => c.name)).toEqual(["pkg:clod/io.github.acme/lobby-1", "pkg:clod/io.github.acme/lobby-20500", "pkg:clod/io.github.acme/lobby-20499"]);
    expect(page.total.approximate).toBe(true);
    const narrower = (await (await get("/api/components?q=lobbyi&sort=downloads&limit=2")).json()) as ComponentList;
    expect(narrower.components.map((c) => c.name)).toEqual(["pkg:clod/io.github.acme/lobby-1", "pkg:clod/io.github.acme/lobby-20499"]);
    expect(((await (await get("/api/components?q=lobb&limit=1")).json()) as ComponentList).components[0]!.name).toBe("pkg:clod/io.github.acme/lobby-1");
  });

  it("returns a rare interface's provider on page 1 however low it ranks, for every sort", async () => {
    await publish(card("0.1.0"));
    const dev = (await env.DB.prepare("SELECT developer_id FROM components").first<{ developer_id: string }>())!.developer_id;
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 20500)
       INSERT INTO components (id, name, namespace, slug, developer_id, repo, latest_version, created_at, updated_at, description, class_name, class_version, class_title, category, category_top, platforms, licence, channel, published_at, downloads)
       SELECT 'busy' || i, 'pkg:clod/io.github.acme/busy-' || i, 'acme', 'busy-' || i, ?1, 'pkg:clod/io.github.acme/busy-' || i, '0.1.0', '2026-10-01', '2026-10-01', 'Busy', 'pkg:clod/com.clodhub/card-deck-class', '1.0.0', 'Card deck', 'games/cards', 'games', ' web ', 'MIT', 'features', '2027-01-01T00:00:00.000Z', 100 + i FROM n`,
    ).bind(dev).run();
    for (const query of ["provides=com.clodhub/card-deck", "provides=com.clodhub/card-deck&sort=updated", "provides=com.clodhub/card-deck&sort=trending", "provides=com.clodhub/card-deck&platform=web", "requires=com.clodhub/random-source&sort=name"]) {
      const res = await get(`/api/components?${query}`);
      const page = (await res.json()) as ComponentList;
      expect(page.components.map((c) => c.name), query).toEqual(["pkg:clod/io.github.acme/card-deck"]);
      expect(page.total, query).toEqual({ count: 1, approximate: false });
      expect(Number(res.headers.get("X-D1-Rows-Read")), query).toBeLessThan(500);
    }
  });

  it("matches short search words whole and longer ones as prefixes", async () => {
    for (const part of exampleComponentEntries()) await publish(part as unknown as Mutable);
    const names = async (q: string) => ((await (await get(`/api/components?q=${q}`)).json()) as ComponentList).components.map((c) => c.name);
    expect(await names("se")).toEqual([]);
    expect((await names("sea"))[0]).toBe("pkg:clod/io.github.acme/seating");
    expect(await names("de")).toEqual([]);
  });

  it("limits download links per address and minute", async () => {
    await publish(card("0.1.0"));
    env.BUNDLE_LINKS_PER_MINUTE = "2";
    const link = (address: string) => handle(new Request(`${BASE}/api/components/card-deck/0.1.0/bundle`, { headers: { "CF-Connecting-IP": address } }), env, deps);
    expect((await link("198.51.100.7")).status).toBe(200);
    expect((await link("198.51.100.7")).status).toBe(200);
    expect((await link("198.51.100.7")).status).toBe(429);
    expect((await link("198.51.100.8")).status).toBe(200);
    deps.advance(60_000);
    expect((await link("198.51.100.7")).status).toBe(200);
  });

  it("pages through entries that tie on the sort value forward and back, each once", async () => {
    for (const part of exampleComponentEntries()) await publish(part as unknown as Mutable);
    const seen: string[] = [];
    let page = (await (await get("/api/components?sort=downloads&limit=2")).json()) as ComponentList;
    seen.push(...page.components.map((c) => c.name));
    while (page.next) {
      page = (await (await get(`/api/components?sort=downloads&limit=2&cursor=${page.next}`)).json()) as ComponentList;
      seen.push(...page.components.map((c) => c.name));
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    const back = (await (await get(`/api/components?sort=downloads&limit=2&cursor=${page.previous}`)).json()) as ComponentList;
    expect(back.components.map((c) => c.name)).toEqual(seen.slice(2, 4));
  });

  it("removes listing totals older than ten minutes and keeps at most the cap, newest first", async () => {
    const old = new Date(Date.now() - 11 * 60_000).toISOString();
    const at = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    await env.DB.prepare("INSERT INTO listing_totals (key, count, approximate, computed_at) VALUES ('old', 1, 0, ?), ('a', 1, 0, ?), ('b', 1, 0, ?), ('c', 1, 0, ?)").bind(old, at(30), at(20), at(10)).run();
    await new CatalogueDb(env.DB).pruneListingTotals(2);
    expect((await env.DB.prepare("SELECT key FROM listing_totals ORDER BY key").all<{ key: string }>()).results.map((r) => r.key)).toEqual(["b", "c"]);
    await env.DB.prepare("INSERT INTO listing_totals (key, count, approximate, computed_at) VALUES ('stale', 1, 0, ?)").bind(old).run();
    await scheduled("7 * * * *", env, deps);
    expect((await env.DB.prepare("SELECT key FROM listing_totals ORDER BY key").all<{ key: string }>()).results.map((r) => r.key)).toEqual(["b", "c"]);
  });

  it("runs every hourly task when the vulnerability check fails, and logs the failure", async () => {
    await publish(card("0.1.0", (e) => (e.foundations.upstream = [{ name: "left-pad", version: "1.3.0", repository: "https://github.com/left-pad/left-pad", purl: "pkg:npm/left-pad@1.3.0", licence: "MIT", notices: ["src/index.mjs"], revision: "e".repeat(40), delivery: { kind: "bundled", files: [{ path: "src/index.mjs", digest: "d".repeat(64) }] } }])));
    const sue = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    const extra = pngHeader(5, 5);
    expect((await upload(extra, "image/png", undefined, sue)).status).toBe(201);
    const id = (await env.DB.prepare("SELECT id FROM components").first<{ id: string }>())!.id;
    deps.advance(86_400_000 + 1000);
    await env.DB.prepare("INSERT INTO downloads_daily (kind, entry_id, version, day, n) VALUES ('component', ?, '0.1.0', ?, 5)").bind(id, deps.now().toISOString().slice(0, 10)).run();
    const failing = deps.fetch;
    deps.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).includes("osv.dev") ? new Response("down", { status: 503 }) : failing(input, init))) as typeof fetch;
    const errors: string[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void errors.push(a.join(" "));
    try {
      await scheduled("7 * * * *", env, deps);
    } finally {
      console.error = original;
      deps.fetch = failing;
    }
    expect(errors.join("\n")).toContain("hourly vulnerability check failed: OSV querybatch answered 503");
    expect((await env.DB.prepare("SELECT downloads FROM components").first<{ downloads: number }>())!.downloads).toBe(5);
    expect((await get(`/images/${await hexOf(extra)}.png`)).status).toBe(404);
  });

  it("deletes the download address hashes at the end of their day (UTC)", async () => {
    await publish(card("0.1.0"));
    expect((await handle(new Request(`${BASE}/api/components/card-deck/0.1.0/bundle`, { headers: { "CF-Connecting-IP": "198.51.100.9" } }), env, deps)).status).toBe(200);
    const held = async () => [(await env.DB.prepare("SELECT COUNT(*) AS n FROM downloads_seen").first<{ n: number }>())!.n, (await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>())!.n];
    expect(await held()).toEqual([1, 1]);
    const now = deps.now();
    deps.advance(Date.parse(`${now.toISOString().slice(0, 10)}T23:30:00Z`) - now.getTime());
    await scheduled("7 * * * *", env, deps);
    expect((await held())[0]).toBe(1);
    deps.advance(45 * 60_000);
    await scheduled("7 * * * *", env, deps);
    expect(await held()).toEqual([0, 0]);
  });

  it("deletes a download link's address hash from 23:59 at the first hourly run after midnight", async () => {
    await publish(card("0.1.0"));
    const now = deps.now();
    deps.advance(Date.parse(`${now.toISOString().slice(0, 10)}T23:59:10Z`) - now.getTime());
    expect((await handle(new Request(`${BASE}/api/components/card-deck/0.1.0/bundle`, { headers: { "CF-Connecting-IP": "198.51.100.10" } }), env, deps)).status).toBe(200);
    const held = async () => [(await env.DB.prepare("SELECT COUNT(*) AS n FROM downloads_seen").first<{ n: number }>())!.n, (await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first<{ n: number }>())!.n];
    expect(await held()).toEqual([1, 1]);
    deps.advance(8 * 60_000);
    await scheduled("7 * * * *", env, deps);
    expect(await held()).toEqual([0, 0]);
  });

  it("names curators by GitHub id, not login", async () => {
    env.CATALOGUE_CURATORS = "george";
    expect((await post("/api/dev/categories", exampleCategories())).status).toBe(403);
    env.CATALOGUE_CURATORS = "42";
    expect((await post("/api/dev/categories", exampleCategories())).status).toBe(200);
  });

  it("counts a filtered total once and keeps it for ten minutes", async () => {
    await publish(card("0.1.0"));
    const total = async () => ((await (await get("/api/components?platform=web")).json()) as ComponentList).total;
    expect(await total()).toEqual({ count: 1, approximate: false });
    await env.DB.prepare("UPDATE listing_totals SET count = 7").run();
    expect(await total()).toEqual({ count: 7, approximate: false });
    deps.advance(11 * 60_000);
    await env.DB.prepare("UPDATE listing_totals SET computed_at = '2000-01-01T00:00:00Z'").run();
    expect(await total()).toEqual({ count: 1, approximate: false });
  });
});
