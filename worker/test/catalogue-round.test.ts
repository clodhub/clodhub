// Channels, images, classes and categories, quality, vulnerabilities and downloads in the catalogue.
import { beforeEach, describe, expect, it } from "vitest";
import { EXAMPLE_BUNDLE_DIGEST, EXAMPLE_IMAGE, EXAMPLE_IMAGE_BYTES, descriptorDigest, exampleCategories, exampleClassEntries, exampleComponentEntries, exampleComponentEntry, pngHeader, webpHeader, type ClassList, type ClassVersionView, type ComponentList, type ComponentVersionView, type RecipeList, type VulnerabilityReport } from "@my/store-shared";
import { CatalogueDb } from "../src/catalogue-db.js";
import type { Env } from "../src/env.js";
import { handle, scheduled } from "../src/index.js";
import { BASE, GH_TOKEN, api, clearDb, fakeFetch, gh, jsonRes, signIn, testDeps, testEnv, type Call, type TestDeps } from "./helpers.js";

type Mutable = Record<string, any>;

let env: Env;
let deps: TestDeps;
let cookie: string;
let osvCalls: Call[];

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
      return jsonRes({ results: queries.map((q) => (q.package.purl === "pkg:npm/left-pad@1.3.0" ? { vulns: [{ id: "GHSA-aaaa-bbbb-cccc", modified: "2026-11-01T00:00:00Z" }] } : {})) });
    },
    "GET api.osv.dev/v1/vulns/GHSA-aaaa-bbbb-cccc": () => jsonRes({ id: "GHSA-aaaa-bbbb-cccc", summary: "Prototype pollution in left-pad", modified: "2026-11-01T00:00:00Z", database_specific: { severity: "HIGH" }, affected: [{ package: { purl: "pkg:npm/left-pad" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "1.3.1" }] }] }] }),
  };
  for (const [i, v] of ["0.1.0", "0.1.1", "0.1.2", "0.2.0", "0.3.0-preview.1"].entries()) Object.assign(routes, release("acme/card-deck", `v${v}`, `card-deck-${v}.tar`, 10 + i));
  for (const [i, part] of exampleComponentEntries().entries()) Object.assign(routes, release(part.source.repository, part.source.tag, part.bundle.asset, 50 + i));
  Object.assign(routes, release("acme/poker-night-recipe", "v0.1.0", "poker-night-0.1.0.tar", 21));
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

async function publish(e: Mutable) {
  const res = await post("/api/dev/components", e);
  expect(res.status, await res.clone().text()).toBe(201);
}

beforeEach(async () => {
  env = testEnv({ CATALOGUE_CURATORS: "george" });
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
    expect(await res.json()).toMatchObject({ status: "published", name: "ourapps-ae/card-deck-class", version: "1.0.0", digest: `sha256:${classDigest}`, url: `${BASE}/classes/card-deck-class` });
    expect(((await (await post("/api/dev/classes", deckClass)).json()) as { status: string }).status).toBe("unchanged");
    await publish(card("0.1.0", (e) => (e.quality = { level: "reviewed", certified: true, liveTested: null })));
    const list = (await (await get("/api/classes?category=games")).json()) as ClassList;
    expect(list.classes.map((c) => [c.name, c.category, c.implementations])).toEqual([["ourapps-ae/card-deck-class", "games/cards", 1]]);
    const view = (await (await get("/api/classes/card-deck-class")).json()) as ClassVersionView;
    expect(view).toMatchObject({ title: "Card deck", summary: "A deck that shuffles, deals and burns cards", category: "games/cards", presentation: "visual", digest: classDigest });
    expect(view.suites.map((s) => s.id)).toEqual(["behaviour"]);
    expect(view.implementationList).toEqual([expect.objectContaining({ name: "acme/card-deck", version: "0.1.0", quality: { level: "reviewed", certified: true, liveTested: null }, thumbnail: `${BASE}/images/${EXAMPLE_IMAGE.thumbnail.slice(7)}.webp`, platforms: ["web", "server", "ios", "macos", "android"] })]);
    const tree = (await (await get("/api/categories")).json()) as { categories: { id: string; classes: number; components: number }[] };
    expect(tree.categories.filter((c) => c.id.startsWith("games")).map((c) => [c.id, c.classes, c.components])).toEqual([["games", 1, 1], ["games/cards", 1, 1], ["games/tables", 0, 0]]);
    const text = await (await get("/classes/card-deck-class.txt")).text();
    expect(text).toContain("Card deck (ourapps-ae/card-deck-class) 1.0.0");
    expect(text).toContain("- acme/card-deck 0.1.0: A shuffled deck");
    expect(await (await get("/classes.txt")).text()).toContain("- Card deck (ourapps-ae/card-deck-class) 1.0.0");
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
    env.CATALOGUE_CURATORS = "george";
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
    expect(before).toEqual({ name: "acme/card-deck", version: "0.1.0", checkedAt: null, count: null, advisories: [] });
    await scheduled("7 * * * *", env, deps);
    const batch = osvCalls.filter((c) => c.url.endsWith("/v1/querybatch"));
    expect(batch).toHaveLength(1);
    expect(JSON.parse(batch[0]!.body!)).toEqual({ queries: [{ package: { purl: "pkg:npm/left-pad@1.3.0" } }] });
    const after = (await (await get("/api/components/card-deck/0.1.0/vulnerabilities")).json()) as VulnerabilityReport;
    expect(after).toEqual({ name: "acme/card-deck", version: "0.1.0", checkedAt: deps.now().toISOString(), count: 1, advisories: [{ id: "GHSA-aaaa-bbbb-cccc", summary: "Prototype pollution in left-pad", severity: "HIGH", affected: ["pkg:npm/left-pad@1.3.0"], fixedIn: ["1.3.1"], waived: null }] });
    expect(((await (await get("/api/components/card-deck/0.1.0")).json()) as ComponentVersionView).vulnerabilitySummary.count).toBe(1);
    expect(((await (await get("/api/components/card-deck/0.2.0/vulnerabilities")).json()) as VulnerabilityReport).count).toBe(0);
    osvCalls.length = 0;
    await scheduled("7 * * * *", env, deps);
    expect(osvCalls).toHaveLength(0);
    deps.advance(25 * 3600 * 1000);
    await scheduled("7 * * * *", env, deps);
    expect(osvCalls.map((c) => c.url)).toEqual(["https://api.osv.dev/v1/querybatch"]);
  });

  it("filters to no known vulnerabilities on the newest version, and does not count a waived advisory", async () => {
    await publish(withPad("0.1.0"));
    await scheduled("7 * * * *", env, deps);
    const names = async (q: string) => ((await (await get(`/api/components?${q}`)).json()) as ComponentList).components.map((c) => c.name);
    expect(await names("secure=true")).toEqual([]);
    await publish(withPad("0.2.0", (e) => (e.vulnerabilityWaivers = [{ id: "GHSA-aaaa-bbbb-cccc", reason: "the padding function is not reachable from the deck" }])));
    expect(((await (await get("/api/components/card-deck/0.2.0/vulnerabilities")).json()) as VulnerabilityReport).advisories[0]!.waived).toBe("the padding function is not reachable from the deck");
    expect(((await (await get("/api/components/card-deck/0.2.0")).json()) as ComponentVersionView).vulnerabilitySummary.count).toBe(0);
    expect(await names("secure=true")).toEqual(["acme/card-deck"]);
  });
});

describe("downloads and trending", () => {
  it("counts each download link per version and day, and sorts by downloads and trending", async () => {
    for (const part of exampleComponentEntries()) await publish(part as unknown as Mutable);
    const bundle = (slug: string) => get(`/api/components/${slug}/0.1.0/bundle`);
    for (let i = 0; i < 3; i++) await bundle("seating");
    await bundle("guided-tour");
    expect(((await (await get("/api/components/seating")).json()) as ComponentVersionView).versionDownloads).toBe(3);
    const top = async (sort: string) => ((await (await get(`/api/components?sort=${sort}&limit=2`)).json()) as ComponentList).components.map((c) => [c.name, c.downloads]);
    expect(await top("downloads")).toEqual([["acme/seating", 3], ["acme/guided-tour", 1]]);
    deps.advance(10 * 86_400_000);
    await bundle("guided-tour");
    await scheduled("17 3 * * *", env, deps);
    expect(await top("trending")).toEqual([["acme/guided-tour", 2], ["acme/apple-host", 0]]);
    expect(await top("downloads")).toEqual([["acme/seating", 3], ["acme/guided-tour", 2]]);
    deps.advance(30 * 86_400_000);
    await new CatalogueDb(env.DB).refreshDownloads(deps.now().toISOString().slice(0, 10));
    expect(((await (await get("/api/components/seating")).json()) as ComponentVersionView).downloads).toBe(0);
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
