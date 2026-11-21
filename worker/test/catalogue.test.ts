import { beforeEach, describe, expect, it } from "vitest";
import { descriptorDigest, EXAMPLE_IMAGE, EXAMPLE_IMAGE_BYTES, exampleCategories, exampleClassEntries, pngHeader, webpHeader, SIGNATURES_NOTE, summariseFoundations, type Foundations, type PackageDetails, EXAMPLE_BUNDLE_DIGEST, EXAMPLE_INTERFACE_DIGEST, exampleComponentEntries, exampleComponentEntry, exampleRecipeEntry, type BundleLink, type BuildReportList, type BuildReportView, type ComponentList, type ComponentVersionView, type DeprecationReport, type RecipeList, type RecipeVersionView } from "@my/store-shared";
import { Db } from "../src/db.js";
import report060 from "./fixtures/ourpoker-0.6.0-2026-11-16.json";
import report080 from "./fixtures/ourpoker-0.8.0-2026-11-20.json";
import { ftsQuery } from "../src/catalogue-db.js";
import { componentDetailsText, componentText, recipeDetailsText, recipeText } from "../src/catalogue-text.js";
import type { Env } from "../src/env.js";
import { handle } from "../src/index.js";
import { BASE, GH_TOKEN, api, clearDb, fakeFetch, gh, jsonRes, signIn, testDeps, testEnv, type Call, type TestDeps } from "./helpers.js";

type Mutable = Record<string, any>;

let env: Env;
let deps: TestDeps;
let cookie: string;
let calls: Call[];

// GitHub as the publisher's repositories see it: pushable, with a release that holds the bundle.
function release(repo: string, tag: string, asset: string, id: number, overrides: { push?: boolean; digest?: string | null; status?: number; releaseStatus?: number } = {}) {
  return {
    [`GET ${gh(`/repos/${repo}`)}`]: () => (overrides.status ? new Response("no", { status: overrides.status }) : jsonRes({ permissions: { push: overrides.push ?? true } })),
    [`GET ${gh(`/repos/${repo}/releases/tags/${tag}`)}`]: () =>
      overrides.releaseStatus
        ? new Response("no", { status: overrides.releaseStatus })
        : jsonRes({ assets: [{ name: asset, url: `https://api.github.com/repos/${repo}/releases/assets/${id}`, digest: overrides.digest === undefined ? EXAMPLE_BUNDLE_DIGEST : overrides.digest }] }),
    [`GET ${gh(`/repos/${repo}/releases/assets/${id}`)}`]: () => new Response("BUNDLEBYTES", { status: 200 }),
  };
}

function githubFor(extra: Record<string, (call: Call) => Response | Promise<Response>> = {}) {
  const stub = fakeFetch({
    ...release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11),
    ...release("acme/poker-night-recipe", "v0.1.0", "poker-night-0.1.0.tar", 21),
    ...release("acme/seating", "v0.1.0", "seating-0.1.0.tar", 31),
    ...release("acme/random-pool", "v0.1.0", "random-pool-0.1.0.tar", 41),
    ...release("acme/server-host", "v0.1.0", "server-host-0.1.0.tar", 51),
    ...release("acme/apple-host", "v0.1.0", "apple-host-0.1.0.tar", 52),
    ...release("acme/guided-tour", "v0.1.0", "guided-tour-0.1.0.tar", 53),
    [`GET ${gh("/user/memberships/orgs/ourapps-ae")}`]: () => jsonRes({ state: "active" }),
    ...extra,
  });
  calls = stub.calls;
  deps = testDeps(stub.fetch);
}

async function saveToken(c = cookie) {
  const res = await handle(api(c, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps);
  expect(res.status).toBe(200);
}

// Uploads image bytes the way the publish tool does.
async function upload(bytes: Uint8Array, type = "image/png", c: string | null = cookie, address?: string) {
  const hex = address ?? [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const headers: Record<string, string> = { "Content-Type": type, Origin: BASE };
  if (c) headers.Cookie = c;
  return handle(new Request(`${BASE}/api/dev/images/${hex}`, { method: "PUT", headers, body: bytes }), env, deps);
}

beforeEach(async () => {
  env = testEnv({ CATALOGUE_CURATORS: "42" });
  await clearDb(env);
  githubFor();
  cookie = await signIn(env, deps);
  await saveToken();
  expect((await post("/api/dev/categories", exampleCategories())).status).toBe(200);
  expect((await upload(EXAMPLE_IMAGE_BYTES.image)).status).toBe(201);
  expect((await upload(EXAMPLE_IMAGE_BYTES.thumbnail, "image/webp")).status).toBe(201);
  for (const c of exampleClassEntries()) expect((await post("/api/dev/classes", c)).status).toBe(201);
  calls.length = 0;
});

const get = (path: string) => handle(api(null, "GET", path), env, deps);
const post = (path: string, body: unknown, c: string | null = cookie) => handle(api(c, "POST", path, body), env, deps);
const del = (path: string, c: string | null = cookie) => handle(api(c, "DELETE", path), env, deps);

function component(patch: (e: Mutable) => void = () => {}): Mutable {
  const e = structuredClone(exampleComponentEntry()) as unknown as Mutable;
  patch(e);
  for (const a of e.foundations.artefacts) a.destination = a.destination.replace("components/card-deck/", `components/${e.name.split("/")[1]}/`);
  return e;
}

function recipe(patch: (e: Mutable) => void = () => {}): Mutable {
  const e = structuredClone(exampleRecipeEntry()) as unknown as Mutable;
  patch(e);
  return e;
}

// A second version of the example component, with its own release.
function nextComponent(version: string, digest: string, patch: (e: Mutable) => void = () => {}): Mutable {
  return component((e) => {
    e.version = version;
    e.digest = digest;
    e.source.tag = `v${version}`;
    e.bundle.asset = `card-deck-${version}.tar`;
    patch(e);
  });
}

const digest = (c: string) => `sha256:${c.repeat(64)}`;

async function publishCard(patch?: (e: Mutable) => void) {
  const res = await post("/api/dev/components", component(patch));
  expect(res.status, await res.clone().text()).toBe(201);
  return res;
}

// The example recipe's preferred components that the catalogue does not hold yet.
async function publishParts() {
  const held = new Set((await env.DB.prepare("SELECT name FROM components").all<{ name: string }>()).results.map((r) => r.name));
  for (const part of exampleComponentEntries().filter((e) => !held.has(e.name))) {
    const res = await post("/api/dev/components", part);
    expect(res.status, `${part.name} ${await res.clone().text()}`).toBe(201);
  }
}

async function publishRecipe(patch?: (e: Mutable) => void) {
  await publishParts();
  const res = await post("/api/dev/recipes", recipe(patch));
  expect(res.status, await res.clone().text()).toBe(201);
  return res;
}

describe("publishing a component", () => {
  it("records the pointer after checking the release with the publisher's token", async () => {
    const res = await publishCard();
    expect(await res.json()).toMatchObject({ status: "published", name: "acme/card-deck", version: "0.1.0", url: `${BASE}/components/card-deck`, api: `${BASE}/api/components/card-deck/0.1.0` });
    const repoCall = calls.find((c) => c.url.endsWith("/repos/acme/card-deck"));
    expect(repoCall?.headers.get("Authorization")).toBe(`Bearer ${GH_TOKEN}`);
    expect(calls.some((c) => c.url.endsWith("/repos/acme/card-deck/releases/tags/v0.1.0"))).toBe(true);
    const row = await env.DB.prepare("SELECT * FROM component_versions").first<Record<string, unknown>>();
    expect(row).toMatchObject({ digest: digest("a"), source_repo: "acme/card-deck", source_tag: "v0.1.0", bundle_asset: "card-deck-0.1.0.tar", bundle_digest: EXAMPLE_BUNDLE_DIGEST });
    const audit = await env.DB.prepare("SELECT event, detail FROM audit_log WHERE event = 'component-published'").first();
    expect(audit).toMatchObject({ detail: "acme/card-deck 0.1.0" });
  });

  it("never stores an archive", async () => {
    await publishCard();
    const columns = (await env.DB.prepare("PRAGMA table_info(component_versions)").all<{ name: string }>()).results.map((c) => c.name);
    expect(columns.filter((c) => /archive|blob|bytes|content/.test(c))).toEqual([]);
    expect(calls.some((c) => c.url.includes("/releases/assets/"))).toBe(false);
  });

  it("answers the same version and digest again without change", async () => {
    await publishCard();
    const again = await post("/api/dev/components", component());
    expect(again.status).toBe(200);
    expect(((await again.json()) as { status: string }).status).toBe("unchanged");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM component_versions").first<{ n: number }>())!.n).toBe(1);
  });

  it("never binds a version to different bytes", async () => {
    await publishCard();
    const res = await post("/api/dev/components", component((e) => (e.digest = digest("c"))));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("different digest");
  });

  it("keeps older versions and moves latest with the newest", async () => {
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11));
    await publishCard();
    githubFor({ ...release("acme/card-deck", "v0.10.0", "card-deck-0.10.0.tar", 12), ...release("acme/card-deck", "v0.2.0", "card-deck-0.2.0.tar", 13) });
    expect((await post("/api/dev/components", nextComponent("0.10.0", digest("d")))).status).toBe(201);
    expect((await post("/api/dev/components", nextComponent("0.2.0", digest("e")))).status).toBe(201);
    const view = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(view.version).toBe("0.10.0");
    expect(view.versions.map((v) => v.version)).toEqual(["0.10.0", "0.2.0", "0.1.0"]);
    expect(((await (await get("/api/components/card-deck/0.2.0")).json()) as ComponentVersionView).digest).toBe(digest("e"));
  });

  it("refuses a name that belongs to another developer", async () => {
    await publishCard();
    const other = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    await saveToken(other);
    const res = await post("/api/dev/components", nextComponent("0.2.0", digest("e")), other);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("another developer");
    expect((await del("/api/dev/components/card-deck", other)).status).toBe(404);
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).version).toBe("0.1.0");
  });

  it("keeps one repository per name and the scope equal to its owner", async () => {
    await publishCard();
    githubFor(release("acme/other", "v0.2.0", "card-deck-0.2.0.tar", 40));
    const moved = await post("/api/dev/components", nextComponent("0.2.0", digest("e"), (e) => (e.source.repository = "acme/other")));
    expect(moved.status).toBe(409);
    const wrongScope = await post("/api/dev/components", component((e) => (e.name = "mallory/card-deck")));
    expect(wrongScope.status).toBe(400);
    expect(((await wrongScope.json()) as { error: string }).error).toContain("scope mallory");
  });

  it("validates the entry and says what is wrong", async () => {
    const res = await post("/api/dev/components", component((e) => ((e.version = "1"), (e.digest = "x"))));
    expect(res.status).toBe(400);
    const error = ((await res.json()) as { error: string }).error;
    expect(error).toContain("version must be three integers");
    expect(error).toContain("digest must be sha256");
    expect((await handle(api(cookie, "POST", "/api/dev/components", "not json"), env, deps)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("refuses an entry that carries a secret", async () => {
    const res = await post("/api/dev/components", component((e) => (e.description = `use token ${GH_TOKEN} here`)));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("secret");
  });

  it("needs a GitHub token, push access, the release and a matching digest", async () => {
    await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: "-" }), env, deps);
    const none = await post("/api/dev/components", component());
    expect(none.status).toBe(409);
    expect(((await none.json()) as { error: string }).error).toContain("GitHub token");
    await saveToken();

    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { push: false }));
    expect((await post("/api/dev/components", component())).status).toBe(403);
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { status: 404 }));
    expect((await post("/api/dev/components", component())).status).toBe(422);
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { status: 500 }));
    expect((await post("/api/dev/components", component())).status).toBe(502);
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { releaseStatus: 404 }));
    const noRelease = await post("/api/dev/components", component());
    expect(noRelease.status).toBe(422);
    expect(((await noRelease.json()) as { error: string }).error).toContain("no published release");
    githubFor(release("acme/card-deck", "v0.1.0", "other.tar", 11));
    expect(((await (await post("/api/dev/components", component())).json()) as { error: string }).error).toContain("no asset named");
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { digest: digest("f") }));
    const mismatch = await post("/api/dev/components", component());
    expect(mismatch.status).toBe(422);
    expect(((await mismatch.json()) as { error: string }).error).toContain("not sha256");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM components").first<{ n: number }>())!.n).toBe(0);
  });

  it("accepts a release whose asset carries no digest", async () => {
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { digest: null }));
    expect((await post("/api/dev/components", component())).status).toBe(201);
  });

  it("requires a signed-in developer, current terms and write scope", async () => {
    expect((await post("/api/dev/components", component(), null)).status).toBe(401);
    const noTerms = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" }, false);
    expect((await post("/api/dev/components", component(), noTerms)).status).toBe(403);

    const read = (await (await post("/api/dev/keys", { name: "reader", scope: "read" })).json()) as { key: string };
    const manage = (await (await post("/api/dev/keys", { name: "writer", scope: "manage" })).json()) as { key: string };
    const asKey = (key: string, method: string, path: string, body?: unknown) => handle(api(null, method, path, body, { Authorization: `Bearer ${key}` }), env, deps);
    expect((await asKey(read.key, "POST", "/api/dev/components", component())).status).toBe(403);
    expect((await asKey(read.key, "GET", "/api/dev/components")).status).toBe(200);
    expect((await asKey(manage.key, "POST", "/api/dev/components", component())).status).toBe(201);
    expect((await asKey(manage.key, "DELETE", "/api/dev/components/card-deck/0.1.0")).status).toBe(200);
  });

  it("limits the names one developer can hold", async () => {
    await publishParts();
    env.CATALOGUE_CURATORS = "";
    const now = new Date().toISOString();
    const dev = (await env.DB.prepare("SELECT id FROM developers").first<{ id: string }>())!.id;
    await env.DB.batch(Array.from({ length: 50 }, (_, i) => env.DB.prepare("INSERT INTO recipes (id, name, scope, slug, developer_id, repo, created_at, updated_at) VALUES (?, ?, 'acme', ?, ?, 'acme/x', ?, ?)").bind(`r${i}`, `acme/recipe-${i}`, `recipe-${i}`, dev, now, now)));
    const res = await post("/api/dev/recipes", recipe());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("at most 50");
  });
});

describe("publishing a recipe", () => {
  it("stores declared foundation facts: counts on the version, the lists on its details", async () => {
    await publishRecipe();
    const r = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    const c = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(r.foundations).toEqual(summariseFoundations(exampleRecipeEntry().foundations, `${BASE}/api/recipes/poker-night/0.1.0/details`));
    expect(c.foundations).toEqual(summariseFoundations(exampleComponentEntry().foundations, `${BASE}/api/components/card-deck/0.1.0/details`));
    for (const v of [r, c]) {
      expect(v.foundationEvidence).toBe("publisher-declared");
      expect(v).not.toHaveProperty("lastSuccessfulVerification");
      for (const field of ["upstream", "compatibility", "classes", "files", "artefacts"]) expect(v.foundations).not.toHaveProperty(field);
    }
    expect(c.foundations.implements.map((x) => x.reference.name)).toEqual(["ourapps-ae/card-deck-class"]);
    expect(r.components[0]!.declaration).not.toHaveProperty("inventory");
    expect(r.components[0]!.declaration.suites.length).toBeGreaterThan(0);
    const details = await get(new URL(r.foundations.details).pathname);
    expect(details.status).toBe(200);
    expect(await details.json()).toEqual({ name: "acme/poker-night", version: "0.1.0", foundationEvidence: "publisher-declared", foundations: exampleRecipeEntry().foundations });
    expect(await (await get("/api/components/card-deck/latest/details")).json()).toMatchObject({ name: "acme/card-deck", foundations: exampleComponentEntry().foundations });
    expect((await get("/api/components/card-deck/9.9.9/details")).status).toBe(404);
    expect((await get("/api/recipes/nope/latest/details")).status).toBe(404);
    const text = await (await get("/components/card-deck/details.txt")).text();
    expect(text).toContain("Package foundations (publisher-declared)");
    expect(text).toContain(`Signatures: ${SIGNATURES_NOTE}`);
    expect(text).not.toContain("Last successful verification");
    const bare = await handle(api(null, "GET", "/components/card-deck/details", undefined, { Accept: "text/plain" }), env, deps);
    expect(await bare.text()).toBe(text);
  });

  it.each(["platforms", "classes", "licence", "upstream", "compatibility", "maintenance"])("requires foundation field %s", async field => {
    const response = await post("/api/dev/components", component(e => delete e.foundations[field]));
    expect(response.status).toBe(400);
  });

  it("rejects descriptor tampering and self-reported verification dates", async () => {
    const tamper = await post("/api/dev/components", component(e => e.foundations.classes[0].descriptor.provides[0].modules.web = ["changed.mjs"]));
    expect(tamper.status).toBe(400); expect(((await tamper.json()) as {error: string}).error).toContain("class-digest");
    expect((await post("/api/dev/components", component(e => e.foundations.lastSuccessfulVerification = "2026-11-15"))).status).toBe(400);
  });

  it("validates recipe.json, the pointers and the diagram", async () => {
    await publishParts();
    const bad = await post("/api/dev/recipes", recipe((e) => (e.recipe.components[0].preferred.version = "x")));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("recipe: components[0].preferred.version");
    const svg = await post("/api/dev/recipes", recipe((e) => (e.page.diagram = "<svg><script>alert(1)</script></svg>")));
    expect(svg.status).toBe(400);
  });

  it("stores the recipe, its slots and its page material", async () => {
    await publishRecipe();
    const version = await env.DB.prepare("SELECT * FROM recipe_versions").first<Record<string, unknown>>();
    expect(version).toMatchObject({ title: "Poker Night", channel: "features", source_repo: "acme/poker-night-recipe", source_tag: "v0.1.0", bundle_asset: "poker-night-0.1.0.tar", document: expect.stringMatching(/^documents\/recipe\/poker-night\/0\.1\.0\/[0-9a-f]{64}\.json$/) });
    expect(JSON.parse(version!.listing as string)).toMatchObject({ category: "games", title: "Poker Night", thumbnail: EXAMPLE_IMAGE.thumbnail });
    const stored = JSON.parse(await (await env.CATALOGUE.get(version!.document as string))!.text()).recipe;
    expect(stored.questions).toHaveLength(7);
    expect(stored.components[1]).toEqual(exampleRecipeEntry().recipe.components[1]);
    const slots = await env.DB.prepare("SELECT slot_id, component_name, component_version, preferred FROM recipe_slots ORDER BY slot_id").all();
    expect(slots.results).toEqual([
      { slot_id: "apple", component_name: "acme/apple-host", component_version: "0.1.0", preferred: 1 },
      { slot_id: "deck", component_name: "acme/card-deck", component_version: "0.1.0", preferred: 1 },
      { slot_id: "host", component_name: "acme/server-host", component_version: "0.1.0", preferred: 1 },
      { slot_id: "seats", component_name: "acme/seating", component_version: "0.1.0", preferred: 1 },
      { slot_id: "tour", component_name: "acme/guided-tour", component_version: "0.1.0", preferred: 1 },
    ]);
  });

  it("stores CEL conditions as written and accepts the reserved application endpoint", async () => {
    await publishRecipe();
    const stored = await env.DB.prepare("SELECT slot_id, included_when FROM recipe_slots WHERE slot_id IN ('apple', 'deck', 'tour') ORDER BY slot_id").all<{ slot_id: string; included_when: string | null }>();
    expect(stored.results.map((r) => [r.slot_id, r.included_when])).toEqual([
      ["apple", "'ios' in targets || 'macos' in targets"],
      ["deck", null],
      ["tour", "lessons"],
    ]);
    const bad = await post("/api/dev/recipes", recipe((e) => ((e.recipe.version = "0.2.0"), (e.recipe.components[4].includedWhen = "lessons + 1"))));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("components[4].includedWhen (slot tour): + is not allowed");
    const ghost = await post("/api/dev/recipes", recipe((e) => ((e.recipe.version = "0.2.0"), (e.recipe.components[0].id = "application"))));
    expect(ghost.status).toBe(400);
    expect(((await ghost.json()) as { error: string }).error).toContain("application is reserved");
  });

  it("refuses a preferred component the catalogue does not list at that version", async () => {
    const res = await post("/api/dev/recipes", recipe());
    expect(res.status).toBe(400);
    const error = ((await res.json()) as { error: string }).error;
    expect(error).toContain("recipe: components[0].preferred acme/card-deck 0.1.0 is not in the catalogue");
    expect(calls.some((c) => c.url.includes("poker-night-recipe"))).toBe(false);
    await publishParts();
    await del("/api/dev/components/seating/0.1.0");
    expect(((await (await post("/api/dev/recipes", recipe())).json()) as { error: string }).error).toContain("components[1].preferred acme/seating 0.1.0 is not in the catalogue");
  });

  it("applies the fit rule to the stored component entries", async () => {
    await publishParts();
    githubFor(release("acme/seating", "v0.2.0", "seating-0.2.0.tar", 32));
    const seating = exampleComponentEntries()[1]!;
    const unfit = { ...seating, version: "0.2.0", digest: digest("2"), settings: [], requires: [...seating.requires, { id: "audit", type: "ae/audit", version: "1.0.0" }], source: { repository: "acme/seating", tag: "v0.2.0" }, bundle: { ...seating.bundle, asset: "seating-0.2.0.tar" } };
    expect((await post("/api/dev/components", unfit)).status).toBe(201);
    const res = await post("/api/dev/recipes", recipe((e) => (e.recipe.components[1].preferred.version = "0.2.0")));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("recipe: components[1].preferred: acme/seating 0.2.0 does not fit the class of slot seats: requires:ae/audit@1.0.0, setting:minimumPlayers");
  });

  it("fits class identity independently of provider document digests", async () => {
    await publishParts();
    githubFor(release("acme/seating", "v0.2.0", "seating-0.2.0.tar", 33));
    const seating = exampleComponentEntries()[1]!;
    const reworded = { ...seating, version: "0.2.0", digest: digest("3"), interfaceDigests: { "ae/seating@1.0.0": digest("9") }, source: { repository: "acme/seating", tag: "v0.2.0" }, bundle: { ...seating.bundle, asset: "seating-0.2.0.tar" } };
    expect((await post("/api/dev/components", reworded)).status).toBe(201);
    const candidate = await post("/api/dev/recipes", recipe((e) => e.recipe.jobs.push({ id: "seats", slot: "seats", candidates: [{ component: "acme/seating", profile: "any" }, { component: "acme/seating", version: "0.2.0", profile: "any" }] })));
    expect(candidate.status).toBe(201);
  });

  it("refuses a sets target the slot's class does not declare and a class configuration that is not a valid schema", async () => {
    await publishParts();
    const unknown = await post("/api/dev/recipes", recipe((e) => (e.recipe.questions[2].effects = [{ sets: { "seats.maximumPlayers": "$answer" } }])));
    expect(((await unknown.json()) as { error: string }).error).toContain("maximumPlayers is not declared in the class configuration of slot seats");
    const invalid = await post("/api/dev/recipes", recipe((e) => (e.foundations.classes[1].descriptor.settings.properties.minimumPlayers = { type: "integer", minimum: "two" })));
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: string }).error).toContain("class-setting-pattern");
  });

  it("shows each slot's class, preferred component, guardians and suitability", async () => {
    await publishRecipe();
    const view = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    const deck = view.components.find((s) => s.id === "deck")!;
    expect(deck.class).toEqual(exampleRecipeEntry().recipe.components[0].class);
    expect(deck.declaration.provides[0]).toMatchObject({ type: "ae/card-deck", version: "1.0.0" });
    expect(deck.preferred).toEqual({ name: "acme/card-deck", version: "0.1.0", url: `${BASE}/components/card-deck` });
    expect(deck.catalogue).toMatchObject({ description: "A shuffled deck of 52 cards that deals and burns cards.", guardians: ["Example Guardian Ltd"] });
    expect(deck.catalogue!.suitability.profiles[0].cost).toBe("none");
    expect(deck.alternatives).toEqual({ count: 0, url: `${BASE}/components?class=ourapps-ae%2Fcard-deck-class` });
    expect(deck.catalogue!.quality).toBeNull();
    expect(deck.catalogue!.thumbnail).toBe(`${BASE}/images/${EXAMPLE_IMAGE.thumbnail.slice(7)}.webp`);
    await del("/api/dev/components/seating/0.1.0");
    const unlisted = ((await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView).components.find((s) => s.id === "seats")!;
    expect(unlisted.catalogue).toBeNull();
    expect(unlisted.preferred.url).toBeNull();
    const used = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(used.usedBy).toEqual([{ name: "acme/poker-night", slug: "poker-night", title: "Poker Night", version: "0.1.0", url: `${BASE}/recipes/poker-night`, slots: [{ id: "deck", preferred: true }] }]);
  });

  it("counts the other listed components implementing each slot's class", async () => {
    await publishRecipe();
    const other = (slug: string, id: number, patch: (e: Mutable) => void = () => {}) => {
      githubFor(release(`acme/${slug}`, "v0.1.0", `${slug}-0.1.0.tar`, id));
      return post("/api/dev/components", component((e) => ((e.name = `acme/${slug}`), (e.source = { repository: `acme/${slug}`, tag: "v0.1.0" }), (e.bundle.asset = `${slug}-0.1.0.tar`), patch(e))));
    };
    expect((await other("fancy-deck", 61)).status).toBe(201);
    expect((await other("strict-deck", 62, (e) => (e.requires = [{ id: "audit", type: "ae/audit", version: "1.0.0" }]))).status).toBe(201);
    const view = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    expect(view.components.find((s) => s.id === "deck")!.alternatives).toEqual({ count: 2, url: `${BASE}/components?class=ourapps-ae%2Fcard-deck-class` });
    expect(view.components.find((s) => s.id === "seats")!.alternatives.count).toBe(0);
    const listed = ((await (await get("/api/components?class=ourapps-ae/card-deck-class&sort=name")).json()) as ComponentList).components.map((c) => c.name);
    expect(listed).toEqual(["acme/card-deck", "acme/fancy-deck", "acme/strict-deck"]);
    const text = await (await get("/recipes/poker-night/details.txt")).text();
    expect(text).toContain(`    other components of this class (2): ${BASE}/components?class=ourapps-ae%2Fcard-deck-class`);
  });
});

describe("job candidates", () => {
  it("records each candidate in its slot: used by, and in the deprecation tree", async () => {
    await publishParts();
    const host = exampleComponentEntries()[2]!;
    host.foundations.artefacts[0].destination = "components/cheap-host/index.mjs";
    githubFor(release("acme/cheap-host", "v0.1.0", "cheap-host-0.1.0.tar", 71));
    expect((await post("/api/dev/components", { ...host, name: "acme/cheap-host", source: { repository: "acme/cheap-host", tag: "v0.1.0" }, bundle: { ...host.bundle, asset: "cheap-host-0.1.0.tar" } })).status).toBe(201);
    await publishRecipe((e) => e.recipe.jobs[0].candidates.push({ component: "acme/cheap-host", version: "0.1.0", profile: "free" }));
    const rows = await env.DB.prepare("SELECT component_name, preferred FROM recipe_slots WHERE slot_id = 'host' ORDER BY component_name").all();
    expect(rows.results).toEqual([{ component_name: "acme/cheap-host", preferred: 0 }, { component_name: "acme/server-host", preferred: 1 }]);
    const used = (await (await get("/api/components/cheap-host")).json()) as ComponentVersionView;
    expect(used.usedBy.map((u) => [u.name, u.slots])).toEqual([["acme/poker-night", [{ id: "host", preferred: false }]]]);
    expect(await (await get("/components/cheap-host.txt")).text()).toContain("Used by recipes: acme/poker-night 0.1.0 (slot host as a job candidate)");
    await post("/api/dev/components/cheap-host/deprecate", {});
    const view = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    expect(view.deprecations.map((d) => [d.name, d.via])).toEqual([["acme/cheap-host", ["acme/poker-night"]]]);
    const hostSlot = view.components.find((s) => s.id === "host")!;
    expect(hostSlot.alternatives.count).toBe(1);
    expect(hostSlot.alternatives.url).toBe(`${BASE}/components?class=ourapps-ae%2Fserver-host-class`);
  });
});

describe("reading recipes", () => {
  beforeEach(async () => {
    await publishRecipe();
  });

  it("lists with category counts, facets, sorts and cursors", async () => {
    githubFor({ ...release("acme/poker-night-recipe", "v0.1.0", "poker-night-0.1.0.tar", 21), ...release("acme/garden-recipe", "v1.0.0", "garden-1.0.0.tar", 22) });
    await publishRecipe((e) => {
      e.recipe.name = "acme/garden-planner";
      e.recipe.title = "Garden Planner";
      e.recipe.summary = "Plan beds and sowing dates.";
      e.recipe.category = "tools";
      e.recipe.tags = ["plants"];
      e.recipe.targets = { client: ["windows"], server: [] };
      e.foundations.platforms = ["windows", "server"];
      e.foundations.licence = "MIT";
      e.images = [{ ...e.images[0], platform: "windows" }];
      e.recipe.version = "1.0.0";
      e.recipe.components = [e.recipe.components[0]];
      e.recipe.jobs = [];
      e.recipe.scale = null;
      e.recipe.questions = [];
      e.recipe.connections = [];
      e.recipe.tests = { defaultAnswers: {}, answerSets: [] };
      e.source = { repository: "acme/garden-recipe", tag: "v1.0.0" };
      e.bundle.asset = "garden-1.0.0.tar";
      e.digest = digest("1");
    });
    const all = (await (await get("/api/recipes")).json()) as RecipeList;
    expect(all.total).toEqual({ count: 2, approximate: false });
    expect(all.query).toMatchObject({ sort: "downloads", deprecated: "include", limit: 30 });
    expect(all.categories.map((c) => [c.id, c.recipes])).toEqual([["delivery", 0], ["games", 1], ["presentation", 0], ["tools", 1]]);
    expect(((await (await get("/api/recipes?category=games")).json()) as RecipeList).categories.map((c) => c.id)).toEqual(["games/cards", "games/tables"]);
    const names = (path: string) => get(path).then((r) => r.json() as Promise<RecipeList>).then((l) => l.recipes.map((x) => x.name));
    expect(await names("/api/recipes?category=tools")).toEqual(["acme/garden-planner"]);
    expect(await names("/api/recipes?platform=ios")).toEqual(["acme/poker-night"]);
    expect(await names("/api/recipes?platform=windows")).toEqual(["acme/garden-planner"]);
    expect(await names("/api/recipes?licence=MIT")).toEqual(["acme/garden-planner"]);
    expect(await names("/api/recipes?publisher=george&sort=name")).toEqual(["acme/garden-planner", "acme/poker-night"]);
    expect(await names("/api/recipes?publisher=nobody")).toEqual([]);
    expect(await names("/api/recipes?category=games&licence=MIT")).toEqual([]);
    expect(await names("/api/recipes?channel=features&sort=name")).toEqual(["acme/garden-planner", "acme/poker-night"]);
    expect(await names("/api/recipes?channel=security")).toEqual([]);
    expect(await names("/api/recipes?quality=packaged")).toEqual([]);
    expect(await names("/api/recipes?secure=true&sort=name")).toEqual(["acme/garden-planner", "acme/poker-night"]);
    expect(await names("/api/recipes?q=plants")).toEqual(["acme/garden-planner"]);
    expect(await names("/api/recipes?sort=updated")).toHaveLength(2);
    const first = (await (await get("/api/recipes?limit=1&sort=name")).json()) as RecipeList;
    expect(first.recipes.map((r) => r.name)).toEqual(["acme/garden-planner"]);
    expect(first.previous).toBeNull();
    const second = (await (await get(`/api/recipes?limit=1&sort=name&cursor=${first.next}`)).json()) as RecipeList;
    expect(second.recipes.map((r) => r.name)).toEqual(["acme/poker-night"]);
    expect(second.next).toBeNull();
    const back = (await (await get(`/api/recipes?limit=1&sort=name&cursor=${second.previous}`)).json()) as RecipeList;
    expect(back.recipes.map((r) => r.name)).toEqual(["acme/garden-planner"]);
    expect((await get("/api/recipes?limit=0")).status).toBe(400);
    expect((await get("/api/recipes?category=Bad%20Value")).status).toBe(400);
    expect((await get("/api/recipes?sort=relevance")).status).toBe(400);
    expect((await get("/api/recipes?quality=great")).status).toBe(400);
  });

  it("returns the summary fields and no secrets or internal ids", async () => {
    const text = await (await get("/api/recipes")).text();
    const list = JSON.parse(text) as RecipeList;
    expect(list.recipes[0]).toEqual({
      name: "acme/poker-night",
      slug: "poker-night",
      version: "0.1.0",
      title: "Poker Night",
      summary: "A card game for a club's league night, with house rules.",
      category: "games",
      platforms: ["web", "server", "ios", "macos", "android"],
      licence: "Apache-2.0",
      quality: null,
      channel: "features",
      vulnerabilities: 0,
      thumbnail: `${BASE}/images/${EXAMPLE_IMAGE.thumbnail.slice(7)}.webp`,
      downloads: 0,
      updatedAt: deps.now().toISOString(),
      tags: ["cards", "multiplayer"],
      targets: { client: ["web", "ios", "android", "macos"], server: ["hosting-provider"] },
      publishedAt: deps.now().toISOString(),
      publisher: { slug: "george", displayName: "George" },
      repository: "acme/poker-night-recipe",
      url: `${BASE}/recipes/poker-night`,
      status: "active",
      deprecations: [],
    });
    const detail = await (await get("/api/recipes/poker-night/0.1.0")).text();
    for (const body of [text, detail]) {
      expect(body).not.toContain(GH_TOKEN);
      expect(body).not.toMatch(/githubToken|github_id|githubId|developer_id|developerId|buildToken|secret"/i);
    }
  });

  it("serves a version and latest with questions, components, tests and versions", async () => {
    const v = (await (await get("/api/recipes/poker-night/0.1.0")).json()) as RecipeVersionView;
    const latest = (await (await get("/api/recipes/poker-night/latest")).json()) as RecipeVersionView;
    expect(latest).toEqual(v);
    expect(v.questions.map((q) => q.id)).toEqual(["targets", "scale", "chips", "lessons", "tourStyle", "server", "serverKey"]);
    expect(v.components).toHaveLength(5);
    expect(v.tests.answerSets[0].id).toBe("web-only");
    expect(v.versions).toEqual([{ version: "0.1.0", digest: digest("a"), publishedAt: deps.now().toISOString(), channel: "features", fixes: [] }]);
    expect(v.release).toEqual({ channel: "features", fixes: [] });
    expect(v.line).toEqual({ line: "0.1", securityReleases: [] });
    expect(v.images).toEqual([{ url: `${BASE}/images/${EXAMPLE_IMAGE.digest.slice(7)}.png`, thumbnail: `${BASE}/images/${EXAMPLE_IMAGE.thumbnail.slice(7)}.webp`, caption: "The table during a hand", platform: "web", width: 1280, height: 800 }]);
    expect(v.vulnerabilitySummary).toEqual({ count: 0, checkedAt: deps.now().toISOString(), url: `${BASE}/api/recipes/poker-night/0.1.0/vulnerabilities` });
    expect(v.bundle).toEqual({ asset: "poker-night-0.1.0.tar", digest: EXAMPLE_BUNDLE_DIGEST, url: `${BASE}/api/recipes/poker-night/0.1.0/bundle` });
    expect(v.description).toContain("Poker Night deals a hand");
    expect(v.diagram).toBe(`${BASE}/api/recipes/poker-night/0.1.0/diagram.svg`);
  });

  it("404s unknown names and versions", async () => {
    for (const path of ["/api/recipes/nope", "/api/recipes/poker-night/9.9.9", "/api/recipes/poker-night/bad", "/api/recipes/Poker/0.1.0", "/api/recipes/poker-night/0.1.0/other"]) expect((await get(path)).status, path).toBe(404);
  });

  it("serves the diagram as a sandboxed image", async () => {
    const res = await get("/api/recipes/poker-night/0.1.0/diagram.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(await res.text()).toContain("<svg");
    githubFor(release("acme/poker-night-recipe", "v0.2.0", "poker-night-0.2.0.tar", 23));
    await publishRecipe((e) => ((e.recipe.version = "0.2.0"), (e.digest = digest("2")), (e.source.tag = "v0.2.0"), (e.bundle.asset = "poker-night-0.2.0.tar"), (e.page.diagram = null)));
    expect((await get("/api/recipes/poker-night/0.2.0/diagram.svg")).status).toBe(404);
  });
});

describe("search", () => {
  beforeEach(async () => {
    await publishRecipe();
  });

  const find = async (q: string, kind = "recipes") => ((await (await get(`/api/${kind}?q=${encodeURIComponent(q)}`)).json()) as RecipeList & ComponentList)[kind as "recipes"].map((r) => r.name);

  it("finds recipes by name, title, summary, class and tags, with prefixes, ranked by relevance", async () => {
    for (const q of ["poker", "Poker Night", "league", "multiplayer", "multi", "acme"]) expect(await find(q), q).toEqual(["acme/poker-night"]);
    expect(await find("zebra")).toEqual([]);
    expect(await find("poker zebra")).toEqual([]);
    expect(((await (await get("/api/recipes?q=poker")).json()) as RecipeList).query.sort).toBe("relevance");
    expect(((await (await get("/api/recipes?q=poker&sort=name")).json()) as RecipeList).recipes).toHaveLength(1);
  });

  it("treats search syntax as plain words", async () => {
    for (const q of ['"', "poker*", "poker OR zebra", "name:poker", "(", "poker-night", "NEAR(a b)", "\\", "'; DROP TABLE recipes; --", "**"]) {
      expect((await get(`/api/recipes?q=${encodeURIComponent(q)}`)).status, q).toBe(200);
    }
    expect(ftsQuery('poker "night" OR *')).toBe('"poker"* "night"* "or"');
    expect(ftsQuery("   ")).toBeNull();
    expect(ftsQuery("a ".repeat(20))!.split(" ")).toHaveLength(8);
    expect((await get(`/api/recipes?q=${"x".repeat(201)}`)).status).toBe(400);
  });

  it("keeps recipes and components apart, and finds a component by its class", async () => {
    expect(await find("poker", "components")).toEqual([]);
    expect(await find("deck", "components")).toEqual(["acme/card-deck"]);
    expect(await find("shuffled", "components")).toEqual(["acme/card-deck"]);
    expect(await find("deck")).toEqual([]);
  });

  it("searches the newest listed version", async () => {
    githubFor(release("acme/poker-night-recipe", "v0.2.0", "poker-night-0.2.0.tar", 23));
    await publishRecipe((e) => ((e.recipe.version = "0.2.0"), (e.recipe.title = "Showdown"), (e.digest = digest("2")), (e.source.tag = "v0.2.0"), (e.bundle.asset = "poker-night-0.2.0.tar")));
    const titles = async (q: string) => ((await (await get(`/api/recipes?q=${q}`)).json()) as RecipeList).recipes.map((r) => `${r.title} ${r.version}`);
    expect(await titles("showdown")).toEqual(["Showdown 0.2.0"]);
    expect(await titles("poker")).toEqual(["Showdown 0.2.0"]);
    await del("/api/dev/recipes/poker-night/0.2.0");
    expect(await titles("showdown")).toEqual([]);
    expect(await titles("poker")).toEqual(["Poker Night 0.1.0"]);
  });
});

describe("components", () => {
  it("lists and filters by class, interface, category and platform, with the category from the class", async () => {
    await publishParts();
    const names = async (q: string) => ((await (await get(`/api/components${q}${q ? "&" : "?"}sort=name`)).json()) as ComponentList).components.map((c) => c.name);
    expect(await names("")).toEqual(["acme/apple-host", "acme/card-deck", "acme/guided-tour", "acme/seating", "acme/server-host"]);
    expect(await names("?provides=ae/card-deck")).toEqual(["acme/card-deck"]);
    expect(await names("?provides=card-deck")).toEqual(["acme/card-deck"]);
    expect(await names("?requires=ae/random-source")).toEqual(["acme/card-deck"]);
    expect(await names("?requires=ae/card-deck")).toEqual(["acme/seating"]);
    expect(await names("?class=ourapps-ae/seating-class")).toEqual(["acme/seating"]);
    expect(await names("?category=games")).toEqual(["acme/card-deck", "acme/seating"]);
    expect(await names("?category=games/tables")).toEqual(["acme/seating"]);
    expect(await names("?category=delivery")).toEqual(["acme/apple-host", "acme/server-host"]);
    expect(await names("?platform=tvos")).toEqual([]);
    const list = (await (await get("/api/components?sort=name")).json()) as ComponentList;
    expect(list.categories.map((c) => [c.id, c.components])).toEqual([["delivery", 2], ["games", 2], ["presentation", 1], ["tools", 0]]);
    expect(list.components[1]).toMatchObject({ name: "acme/card-deck", category: "games/cards", class: { name: "ourapps-ae/card-deck-class", version: "1.0.0", title: "Card deck" } });
    const tree = (await (await get("/api/categories")).json()) as { categories: { id: string; components: number; classes: number }[] };
    expect(tree.categories.find((c) => c.id === "games/cards")).toMatchObject({ components: 1 });
  });

  it("refuses a visual class without images and an image not uploaded", async () => {
    const none = await post("/api/dev/components", component((e) => (e.images = [])));
    expect(none.status).toBe(400);
    expect(((await none.json()) as { error: string }).error).toContain("visual class");
    const missing = await post("/api/dev/components", component((e) => (e.images[0].digest = digest("7"))));
    expect(missing.status).toBe(422);
    expect(((await missing.json()) as { error: string }).error).toContain("upload the image first");
    const size = await post("/api/dev/components", component((e) => (e.images[0].width = 1000)));
    expect(((await size.json()) as { error: string }).error).toContain("is 1280 by 800");
  });

  it("takes the category and class from the published class and refuses a component whose copy differs or whose class is unpublished", async () => {
    const changed = await post("/api/dev/components", component((e) => {
      e.foundations.classes[0].descriptor.category = "tools";
      e.foundations.classes[0].reference.digest = descriptorDigest(e.foundations.classes[0].descriptor);
      e.foundations.implements = [e.foundations.classes[0].reference];
    }));
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as { error: string }).error).toContain("the published class has");
    const unpublished = await post("/api/dev/components", component((e) => {
      e.foundations.classes[0].descriptor.version = "2.0.0";
      e.foundations.classes[0].reference.version = "2.0.0";
      e.foundations.classes[0].reference.digest = descriptorDigest(e.foundations.classes[0].descriptor);
      e.foundations.implements = [e.foundations.classes[0].reference];
    }));
    expect(unpublished.status).toBe(400);
    expect(((await unpublished.json()) as { error: string }).error).toContain("is not published; publish the class first");
    await publishCard();
    const card = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(card).toMatchObject({ category: "games/cards" });
  });

  it("refuses quality from anyone but a curator, and sets it as a curator", async () => {
    const quality = { level: "reviewed", certified: true, liveTested: null };
    env.CATALOGUE_CURATORS = "";
    expect((await post("/api/dev/components", component((e) => (e.quality = quality)))).status).toBe(403);
    env.CATALOGUE_CURATORS = "42";
    await publishCard((e) => (e.quality = quality));
    const v = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(v.quality).toEqual(quality);
    const names = async (q: string) => ((await (await get(`/api/components?${q}`)).json()) as ComponentList).components.map((c) => c.name);
    expect(await names("quality=reviewed")).toEqual(["acme/card-deck"]);
    expect(await names("quality=integration-tested")).toEqual([]);
    expect(await names("certified=true")).toEqual(["acme/card-deck"]);
    expect(await names("certified=false")).toEqual([]);
    const live = { level: "live-tested", certified: true, liveTested: { at: "2026-11-19", platform: "web" } };
    expect((await post("/api/dev/components/card-deck/0.1.0/quality", live)).status).toBe(200);
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).quality).toEqual(live);
    expect(await names("quality=live-tested")).toEqual(["acme/card-deck"]);
    expect((await post("/api/dev/components/card-deck/0.1.0/quality", { level: "live-tested", certified: true })).status).toBe(400);
    env.CATALOGUE_CURATORS = "";
    expect((await post("/api/dev/components/card-deck/0.1.0/quality", live)).status).toBe(403);
  });

  it("keeps optional requirements and profile settings through publication, reads and text", async () => {
    await publishCard((e) => {
      e.requires = [{ id: "random-source", type: "ae/random-source", version: "1.0.0", optional: true }, { id: "audit", type: "ae/audit", version: "1.0.0" }];
      e.dependencies = [{ name: "acme/random-pool", version: "0.1.0" }];
      e.suitability.profiles[0].settings = { plan: "eco", capacity: 10, durable: true };
    });
    const view = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(view.requires).toEqual([{ id: "random-source", type: "ae/random-source", version: "1.0.0", optional: true }, { id: "audit", type: "ae/audit", version: "1.0.0" }]);
    expect(view.dependencies).toEqual([{ name: "acme/random-pool", version: "0.1.0" }]);
    expect(view.suitability.profiles[0].settings).toEqual({ plan: "eco", capacity: 10, durable: true });
    const text = await (await get("/components/card-deck.txt")).text();
    expect(text).toContain("Requires: random-source (ae/random-source 1.0.0, optional), audit (ae/audit 1.0.0)");
    expect(text).toContain("Class: ourapps-ae/card-deck-class@1.0.0 (Card deck); category games/cards");
    expect(text).toContain("settings plan \"eco\", capacity 10, durable true");
    const bad = await post("/api/dev/components", nextComponent("0.2.0", digest("e"), (e) => (e.requires[0].optional = "yes")));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("requires[0].optional must be true or false");
  });

  it("serves the entry with suitability, guardians, migration and source", async () => {
    await publishCard((e) => (e.migration = { stores: [{ id: "rooms", schema: { name: "ae/room-state", version: "1.0.0" } }], formats: ["ndjson"], portable: true, requiresStop: false, retentionDays: 30 }));
    const v = (await (await get("/api/components/card-deck/0.1.0")).json()) as ComponentVersionView;
    expect(v).toMatchObject({
      name: "acme/card-deck",
      version: "0.1.0",
      digest: digest("a"),
      description: "A shuffled deck of 52 cards that deals and burns cards.",
      guardians: ["Example Guardian Ltd"],
      source: { repository: "acme/card-deck", tag: "v0.1.0" },
      bundle: { asset: "card-deck-0.1.0.tar", digest: EXAMPLE_BUNDLE_DIGEST },
      migration: { formats: ["ndjson"], retentionDays: 30 },
      usedBy: [],
    });
    expect(v.suitability.profiles[0]).toMatchObject({ id: "any", cost: "none" });
    expect((await get("/api/components/card-deck/0.9.0")).status).toBe(404);
  });
});

describe("unlisting", () => {
  beforeEach(async () => {
    await publishCard();
    githubFor({ ...release("acme/card-deck", "v0.2.0", "card-deck-0.2.0.tar", 12) });
    expect((await post("/api/dev/components", nextComponent("0.2.0", digest("e")))).status).toBe(201);
  });

  it("hides one version everywhere and moves latest to the next newest", async () => {
    const res = await del("/api/dev/components/card-deck/0.2.0");
    expect(await res.json()).toEqual({ ok: true, unlisted: 1 });
    expect((await get("/api/components/card-deck/0.2.0")).status).toBe(404);
    expect((await get("/api/components/card-deck/0.2.0/bundle")).status).toBe(404);
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).version).toBe("0.1.0");
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).versions.map((v) => v.version)).toEqual(["0.1.0"]);
    expect(((await (await get("/api/components")).json()) as ComponentList).components[0].version).toBe("0.1.0");
  });

  it("hides every version when none is named, and keeps the rows", async () => {
    expect(await (await del("/api/dev/components/card-deck")).json()).toEqual({ ok: true, unlisted: 2 });
    expect(((await (await get("/api/components")).json()) as ComponentList).total).toEqual({ count: 0, approximate: false });
    expect((await get("/api/components/card-deck")).status).toBe(404);
    expect(((await (await get("/api/components?q=deck")).json()) as ComponentList).components).toEqual([]);
    expect(((await (await get("/api/categories")).json()) as { categories: { id: string; components: number }[] }).categories.find((c) => c.id === "games")!.components).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM component_versions").first<{ n: number }>())!.n).toBe(2);
    const mine = (await (await handle(api(cookie, "GET", "/api/dev/components"), env, deps)).json()) as { components: { name: string; latestVersion: string | null; versions: { version: string; listed: boolean }[] }[] };
    expect(mine.components[0]).toMatchObject({ name: "acme/card-deck", latestVersion: null });
    expect(mine.components[0].versions.map((v) => v.listed)).toEqual([false, false]);
  });

  it("keeps the digest bound after unlisting, and lists the version again on republish", async () => {
    await del("/api/dev/components/card-deck/0.2.0");
    githubFor({ ...release("acme/card-deck", "v0.2.0", "card-deck-0.2.0.tar", 12) });
    expect((await post("/api/dev/components", nextComponent("0.2.0", digest("9")))).status).toBe(409);
    const again = await post("/api/dev/components", nextComponent("0.2.0", digest("e")));
    expect(again.status).toBe(201);
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).version).toBe("0.2.0");
    expect(((await (await get("/api/components?q=deck")).json()) as ComponentList).components).toHaveLength(1);
  });

  it("answers unknown names and versions with 404 and is quiet when repeated", async () => {
    expect((await del("/api/dev/components/nope")).status).toBe(404);
    expect((await del("/api/dev/components/card-deck/9.9.9")).status).toBe(404);
    await del("/api/dev/components/card-deck/0.2.0");
    expect(await (await del("/api/dev/components/card-deck/0.2.0")).json()).toEqual({ ok: true, unlisted: 0 });
    expect((await del("/api/dev/components/card-deck", null)).status).toBe(401);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE event = 'component-unlisted'").first<{ n: number }>())!.n).toBe(2);
  });
});

describe("bundle links", () => {
  beforeEach(async () => {
    await publishRecipe();
  });

  it("returns a signed one-hour link that streams the release asset with the publisher's token", async () => {
    const res = await get("/api/recipes/poker-night/0.1.0/bundle");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const link = (await res.json()) as BundleLink;
    expect(link).toMatchObject({ name: "acme/poker-night", version: "0.1.0", digest: digest("a"), asset: "poker-night-0.1.0.tar", assetDigest: EXAMPLE_BUNDLE_DIGEST });
    expect(link.status).toBe("available");
    expect(link.deprecations).toEqual([]);
    expect(link.url).toMatch(new RegExp(`^${BASE}/dl/`));
    expect(link.expiresAt).toBe("2026-10-16T11:00:00.000Z");
    expect(JSON.stringify(link)).not.toContain(GH_TOKEN);
    expect(JSON.stringify(link)).not.toContain("api.github.com");

    calls.length = 0;
    const file = await handle(new Request(link.url!), env, deps);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("BUNDLEBYTES");
    expect(file.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(file.headers.get("Content-Disposition")).toBe('attachment; filename="poker-night-0.1.0.tar"');
    expect(calls[0].headers.get("Authorization")).toBe(`Bearer ${GH_TOKEN}`);
  });

  it("expires after an hour", async () => {
    const link = (await (await get("/api/components/card-deck/latest/bundle")).json()) as BundleLink;
    deps.advance(61 * 60_000);
    expect((await handle(new Request(link.url!), env, deps)).status).toBe(403);
  });

  it("refuses to link a bundle that no longer matches the recorded digest or is gone", async () => {
    githubFor(release("acme/poker-night-recipe", "v0.1.0", "poker-night-0.1.0.tar", 21, { digest: digest("f") }));
    expect((await get("/api/recipes/poker-night/0.1.0/bundle")).status).toBe(502);
    githubFor(release("acme/poker-night-recipe", "v0.1.0", "other.tar", 21));
    expect((await get("/api/recipes/poker-night/0.1.0/bundle")).status).toBe(502);
    githubFor(release("acme/poker-night-recipe", "v0.1.0", "poker-night-0.1.0.tar", 21, { releaseStatus: 404 }));
    const res = await get("/api/recipes/poker-night/0.1.0/bundle");
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("acme");
    expect((await get("/api/recipes/nope/0.1.0/bundle")).status).toBe(404);
  });

  it("serves component bundles the same way", async () => {
    const link = (await (await get("/api/components/card-deck/0.1.0/bundle")).json()) as BundleLink;
    expect(link.asset).toBe("card-deck-0.1.0.tar");
    expect(await (await handle(new Request(link.url!), env, deps)).text()).toBe("BUNDLEBYTES");
  });
});

describe("page variants", () => {
  beforeEach(async () => {
    await publishRecipe();
  });

  it("answers a page address with plain text when the client does not ask for HTML", async () => {
    const text = await handle(api(null, "GET", "/recipes/poker-night", undefined, { Accept: "*/*" }), env, deps);
    expect(text.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await text.text()).toContain("Poker Night (acme/poker-night) 0.1.0");
    const list = await handle(api(null, "GET", "/components", undefined, { Accept: "text/plain" }), env, deps);
    expect(await list.text()).toContain("card-deck");
  });

  it("serves plain text and JSON for every public page", async () => {
    const list = await get("/recipes.txt");
    expect(list.status).toBe(200);
    expect(list.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const listText = await list.text();
    expect(listText).toContain("ourapps recipe library");
    expect(listText).toContain("- Poker Night (acme/poker-night) 0.1.0: A card game for a club's league night, with house rules.");
    expect(listText).toContain("Copyright Level N Ltd 2026");

    const page = await (await get("/recipes/poker-night.txt")).text();
    expect(page).toContain("Poker Night (acme/poker-night) 0.1.0");
    expect(page).toContain("Build it (aepm, Python 3.12, Node.js, Graphviz)");
    expect(page).toContain("python3 -m aepm fetch poker-night@0.1.0 --with-dependencies --store store");
    expect(page).toContain("- chips (integer): Starting chips?");
    // The questions in the three groups of ask, the follow-ups with the answer that asks them.
    const groups = ["Ask the person (2)", "Ask unless the request settles it (2)", "Defaults (3)"].map((h) => page.indexOf(h));
    expect(groups.every((at, i) => at > 0 && (i === 0 || at > groups[i - 1]))).toBe(true);
    expect(page.indexOf("- server (choice)")).toBeLessThan(groups[1]);
    expect(page).toContain("- tourStyle (choice): Short or full lessons?\n  follow-up: asked when lessons is yes");
    expect(page).toContain("- serverKey (secretRef): Reference to the hosting access key\n  follow-up: asked when server is paid");
    expect(page).toContain("Tell the person how many questions toAsk lists, ask them in one round, include as conditional questions in that round the followUps whose condition one of those answers could meet, and add no others");
    expect(page).toContain("Release: features");
    expect(page).toContain("Line 0.1: no security releases");
    expect(page).toContain("Known vulnerabilities: none known");
    expect(page).toContain("Slots (5): each needs a component of its class");
    expect(page).toContain("- deck: class ourapps-ae/card-deck-class@1.0.0; preferred acme/card-deck@0.1.0");
    expect(page).toContain("- apple: class ourapps-ae/apple-shell-class@1.0.0; preferred acme/apple-host@0.1.0; only when (targets includes ios) or (targets includes macos)");
    expect(page).toContain("python3 -m aepm alternatives poker-night@0.1.0 SLOT --store store lists the components that fit, then add --substitute SLOT=NAME@VERSION to design");
    expect(page).toContain("sets host.targets to the answer");
    expect(page).toContain("range: 100 to 1000000");
    expect(page).toContain("- job server fills slot host (the answer to server restricts the candidates first): acme/server-host (free), acme/server-host (paid)");
    expect(page).toContain("Tested answer sets: default, web-only");
    expect(page).toContain(`- acme/card-deck@0.1.0 ${BASE}/components/card-deck.txt`);
    expect(page).toContain(`${BASE}/recipes/poker-night/details.txt?version=0.1.0`);
    expect(page).not.toContain("Package foundations");
    expect(page).not.toContain(GH_TOKEN);
    // An agent reads in this order: how to build, the questions, the slots, the components, the links.
    const order = ["Build it (aepm", "Questions (", "Slots (", "Components (", "Links"].map((h) => page.indexOf(h));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);

    const details = await get("/recipes/poker-night/details.txt");
    expect(details.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const more = await details.text();
    expect(more).toContain("Poker Night (acme/poker-night) 0.1.0: details");
    expect(more).toContain("class: ourapps-ae/card-deck-class 1.0.0");
    expect(more).toContain("provides ae/seating 1.0.0; requires ae/card-deck 1.0.0; settings minimumPlayers integer, always written");
    expect(more).toContain("provides ae/server-host 1.0.0; requires none; settings targets string (label), always written, expectedPeople integer, always written, accountReference string (slug)");
    expect(more).toContain("- slot apple (only when (targets includes ios) or (targets includes macos))");
    expect(more).toContain("    other components of this class (0): https://ourapps.app/components?class=ourapps-ae%2Fcard-deck-class\n    python3 -m aepm alternatives poker-night@0.1.0 deck --store store");
    expect(more).toContain("- seats.seating -> application.seating");
    expect(more).toContain("guardians: Example Guardian Ltd");
    expect(more).toContain("Package foundations (publisher-declared)");
    expect(more).toContain("Wrapper licence: ");
    expect(more).not.toContain(GH_TOKEN);
    expect((await get("/recipes/poker-night/details.txt?version=0.1.0")).status).toBe(200);
    expect((await get("/recipes/poker-night/details.txt?version=9.9.9")).status).toBe(404);
    expect((await get("/recipes/nope/details.txt")).status).toBe(404);

    const json = (await (await get("/recipes/poker-night.json")).json()) as RecipeVersionView;
    expect(json).toEqual((await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView);

    // OurPoker 0.7.0 has 39 slots, 825 upstream records and 723 exact dependencies; its recipe page and version stay small.
    const slot = json.components[0]!;
    const full = ((await (await get("/api/recipes/poker-night/0.1.0/details")).json()) as PackageDetails).foundations;
    const upstream: Foundations["upstream"][number] = { name: "an-upstream-library-with-a-long-name", version: "1.0.0", revision: null, repository: "https://example.org/upstream", purl: "pkg:npm/an-upstream-library-with-a-long-name@1.0.0", licence: "MIT", notices: ["notices/npm/an-upstream-library-with-a-long-name@1.0.0/0-LICENSE"], delivery: { kind: "build-time", manager: "npm", lock: "implementation/package-lock.json", digest: "0".repeat(64), packagePath: "node_modules/an-upstream-library-with-a-long-name", integrity: `sha512-${"A".repeat(86)}==` } };
    const largeFoundations: Foundations = { ...full, upstream: Array.from({ length: 825 }, () => upstream), compatibility: { ...full.compatibility, dependencies: Array.from({ length: 723 }, (_, i) => ({ isolation: "isolated", name: `pkg:npm/dependency-${i}`, version: "1.0.0" })) } };
    const large: RecipeVersionView = {
      ...json,
      components: Array.from({ length: 39 }, (_, i) => ({ ...slot, id: `slot-${i}`, preferred: { ...slot.preferred, name: `acme/part-${i}` } })),
      foundations: summariseFoundations(largeFoundations, json.foundations.details),
    };
    const summary = recipeText(large, BASE);
    const rest = recipeDetailsText(large, { name: json.name, version: json.version, foundationEvidence: "publisher-declared", foundations: largeFoundations }, BASE);
    expect(summary.length).toBeLessThan(60_000);
    expect(JSON.stringify(large).length).toBeLessThan(100_000);
    expect(JSON.stringify(large.foundations)).not.toContain("an-upstream-library-with-a-long-name");
    expect(summary).not.toContain("an-upstream-library-with-a-long-name");
    expect(summary).toContain("- acme/part-38@0.1.0");
    expect(rest.split("Upstream: an-upstream-library-with-a-long-name").length - 1).toBe(825);
    expect(rest).toContain("pkg:npm/dependency-722");
    expect(((await (await get("/recipes.json?category=games")).json()) as RecipeList).total).toEqual({ count: 1, approximate: false });

    const components = await (await get("/components.txt")).text();
    expect(components).toContain("- acme/card-deck 0.1.0: A shuffled deck of 52 cards that deals and burns cards.\n  class ourapps-ae/card-deck-class@1.0.0 (Card deck); category games/cards");
    expect(components).toContain("5 components match; this page shows 5, sorted by downloads.");
    const one = await (await get("/components/card-deck.txt")).text();
    expect(one).toContain("Provides: card-deck (ae/card-deck 1.0.0)");
    expect(one).toContain("Used by recipes: acme/poker-night 0.1.0 (slot deck)");
    expect(one).toContain("Settings (0)");
    const host = await (await get("/components/server-host.txt")).text();
    expect(host).toContain("Settings (3)\n- targets: string (label); required, no default\n- expectedPeople: integer; optional, has a default\n- accountReference: string (slug); optional, no default, secret");
    expect(one).toContain("Data migration: this component keeps no data");
    expect(((await (await get("/components/card-deck.json")).json()) as ComponentVersionView).name).toBe("acme/card-deck");
    {
      expect(one).toContain("Implements: ourapps-ae/card-deck-class@1.0.0 ");
      expect(one).toContain("Platforms: web, server, ios, macos, android");
      expect(one).toContain('- as a slot in recipe.json components: {"id":"card-deck","class":{"name":"ourapps-ae/card-deck-class","version":"1.0.0","digest":"');
      expect(one).toContain("--substitute SLOT=acme/card-deck@0.1.0");
      expect(one).toContain(`${BASE}/components/card-deck/details.txt?version=0.1.0`);
      expect(one).not.toContain("Package foundations");
      // An agent reads in this order: the class and interfaces, settings, how to use it, versions, links.
      const order = ["Implements:", "Provides:", "Platforms:", "Toolchains:", "Settings (", "How to use in a recipe", "Versions", "Links"].map((h) => one.indexOf(h));
      expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);

      const details = await get("/components/card-deck/details.txt");
      expect(details.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
      const more = await details.text();
      expect(more).toContain("acme/card-deck 0.1.0: details");
      expect(more).toContain("Package foundations (publisher-declared)");
      expect(more).toContain("Class interface and test inventory: ");
      expect(more).toContain("- src/index.mjs\n");
      expect(more).toContain("- src/index.mjs -> components/card-deck/index.mjs");
      expect(more).not.toContain(GH_TOKEN);
      expect((await get("/components/card-deck/details.txt?version=0.1.0")).status).toBe(200);
      expect((await get("/components/card-deck/details.txt?version=9.9.9")).status).toBe(404);
      expect((await get("/components/nope/details.txt")).status).toBe(404);

      // android-host 0.7.0 has 344 upstream sources, 291 exact dependencies and 468 files; its component page stays small.
      const card = (await (await get("/components/card-deck.json")).json()) as ComponentVersionView;
      const cardFull = ((await (await get("/api/components/card-deck/0.1.0/details")).json()) as PackageDetails).foundations;
      const upstream: Foundations["upstream"][number] = { name: "an-upstream-library-with-a-long-name", version: "1.0.0", revision: null, repository: "https://example.org/upstream", purl: "pkg:maven/org.example/an-upstream-library-with-a-long-name@1.0.0", licence: "Apache-2.0", notices: ["notices/maven/an-upstream-library-with-a-long-name@1.0.0/0-LICENSE"], delivery: { kind: "bundled", files: [{ path: "vendor/an-upstream-library-with-a-long-name.jar", digest: "0".repeat(64) }] } };
      const largeFoundations: Foundations = {
        ...cardFull,
        upstream: Array.from({ length: 344 }, () => upstream),
        compatibility: { ...cardFull.compatibility, dependencies: Array.from({ length: 291 }, (_, i) => ({ isolation: "isolated", name: `pkg:maven/org.example/dependency-${i}`, version: "1.0.0" })) },
        files: Array.from({ length: 468 }, (_, i) => ({ path: `android/src/main/java/app/ourapps/host/File${i}.kt`, executable: false })),
      };
      const large: ComponentVersionView = { ...card, foundations: summariseFoundations(largeFoundations, card.foundations.details) };
      const summary = componentText(large, BASE);
      const rest = componentDetailsText(large, { name: card.name, version: card.version, foundationEvidence: "publisher-declared", foundations: largeFoundations }, BASE);
      expect(summary.length).toBeLessThan(30_000);
      expect(JSON.stringify(large).length).toBeLessThan(20_000);
      expect(large.foundations.counts).toEqual({ upstream: 344, dependencies: 291, classes: 1, files: 468, artefacts: cardFull.artefacts.length });
      expect(summary).toContain("344 upstream sources, 291 exact dependencies, 468 files");
      expect(summary).not.toContain("an-upstream-library-with-a-long-name");
      expect(rest.split("Upstream: an-upstream-library-with-a-long-name").length - 1).toBe(344);
      expect(rest).toContain("pkg:maven/org.example/dependency-290");
      expect(rest).toContain("File467.kt");
    }
  });

  it("searches and filters in the text variants and picks a version", async () => {
    expect(await (await get("/recipes.txt?q=poker")).text()).toContain("1 recipes match; this page shows 1, sorted by relevance.");
    const paged = await (await get("/components.txt?limit=2&sort=name")).text();
    expect(paged).toContain("this page shows 2, sorted by name");
    const next = /Next: (\S+)/.exec(paged)![1]!;
    expect(next).toContain(`${BASE}/components.txt?sort=name&cursor=`);
    const second = await (await get(new URL(next).pathname + new URL(next).search + "&limit=2")).text();
    expect(second).toContain("- acme/guided-tour 0.1.0");
    expect(second).toContain("Previous: ");
    expect(await (await get("/classes.txt")).text()).toContain("ourapps component classes");
    expect(await (await get("/categories.txt")).text()).toContain("  - Cards (games/cards): 1 classes, 1 components, 0 recipes");
    expect(await (await get("/components.txt?q=nothingmatches")).text()).toContain("No components match.");
    expect(await (await get("/recipes.txt?category=tools")).text()).toContain("No recipes match.");
    expect((await get("/recipes/poker-night.txt?version=0.1.0")).status).toBe(200);
    expect((await get("/recipes/poker-night.txt?version=9.9.9")).status).toBe(404);
    expect((await get("/recipes/nope.txt")).status).toBe(404);
    expect((await get("/recipes/Bad.txt")).status).toBe(404);
  });

  it("lists the public pages in the sitemap", async () => {
    const res = await get("/sitemap.xml");
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    const xml = await res.text();
    for (const path of ["/recipes", "/components", "/recipes/poker-night", "/components/card-deck", "/terms"]) expect(xml).toContain(`<loc>${BASE}${path}</loc>`);
  });
});

describe("names and slugs", () => {
  it("keeps recipes and components out of developer page names", async () => {
    for (const slug of ["recipes", "components"]) {
      const res = await handle(api(cookie, "PUT", "/api/dev/me", { slug, displayName: "George" }), env, deps);
      expect(res.status, slug).toBe(400);
    }
  });

  it("uses the signed-in developer's data layer only", async () => {
    await publishCard();
    const db = Db.from(env);
    expect((await db.developerBySlug("george"))!.slug).toBe("george");
  });
});

// ---------------------------------------------------------------- deprecation

const POOL = (patch: (e: Mutable) => void = () => {}) =>
  component((e) => {
    e.name = "acme/random-pool";
    e.description = "A pool of random numbers.";
    e.tags = ["random"];
    e.provides = [{ id: "random-source", type: "ae/random-source", version: "1.0.0" }];
    e.requires = [];
    e.interfaceDigests = { "ae/random-source@1.0.0": EXAMPLE_INTERFACE_DIGEST };
    e.interfaceModules = {};
    e.source = { repository: "acme/random-pool", tag: "v0.1.0" };
    e.bundle.asset = "random-pool-0.1.0.tar";
    patch(e);
  });

async function publishPool(patch?: (e: Mutable) => void) {
  const res = await post("/api/dev/components", POOL(patch));
  expect(res.status, await res.clone().text()).toBe(201);
}

// card-deck builds on random-pool, and poker-night prefers card-deck and the other example components.
async function publishChain() {
  await publishPool();
  await publishCard((e) => (e.dependencies = [{ name: "acme/random-pool", version: "0.1.0" }]));
  await publishRecipe();
}



describe("developer deprecation", () => {
  beforeEach(async () => {
    await publishCard();
  });

  it("deprecates a component with a replacement and shows it in every response", async () => {
    await publishPool();
    const res = await post("/api/dev/components/card-deck/deprecate", { replacement: "acme/random-pool" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: "acme/card-deck", status: "deprecated", deprecated: { since: deps.now().toISOString(), reason: "owner-deprecated", replacement: "acme/random-pool" } });
    const notice = { name: "acme/card-deck", version: "0.1.0", status: "deprecated", reason: "owner-deprecated", since: deps.now().toISOString(), replacement: "acme/random-pool", via: [] };

    const detail = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(detail.status).toBe("deprecated");
    expect(detail.deprecations).toEqual([notice]);
    const list = (await (await get("/api/components")).json()) as ComponentList;
    expect(list.components.find((c) => c.name === "acme/card-deck")!.deprecations).toEqual([notice]);
    const found = (await (await get("/api/components?q=deck")).json()) as ComponentList;
    expect(found.components[0].deprecations).toEqual([notice]);
    expect(((await (await get("/components/card-deck.json")).json()) as ComponentVersionView).deprecations).toEqual([notice]);

    const text = await (await get("/components/card-deck.txt")).text();
    expect(text.split("\n")[2]).toBe("DEPRECATION WARNING: acme/card-deck 0.1.0 is deprecated by its publisher (owner-deprecated, since 2026-10-16T10:00:00.000Z); replacement acme/random-pool");
    expect(await (await get("/components.txt")).text()).toContain("  DEPRECATION WARNING: acme/card-deck 0.1.0 is deprecated by its publisher");
    const link = (await (await get("/api/components/card-deck/0.1.0/bundle")).json()) as BundleLink;
    expect(link).toMatchObject({ status: "available", deprecations: [notice] });
    expect(await (await handle(new Request(link.url!), env, deps)).text()).toBe("BUNDLEBYTES");
    expect((await env.DB.prepare("SELECT detail FROM audit_log WHERE event = 'component-deprecated'").first<{ detail: string }>())!.detail).toBe("acme/card-deck -> acme/random-pool");
  });

  it("reverses with undeprecate and takes an empty body", async () => {
    expect((await handle(new Request(`${BASE}/api/dev/components/card-deck/deprecate`, { method: "POST", headers: { Cookie: cookie, Origin: BASE } }), env, deps)).status).toBe(200);
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).status).toBe("deprecated");
    const back = await post("/api/dev/components/card-deck/undeprecate", {});
    expect(await back.json()).toEqual({ ok: true, name: "acme/card-deck", status: "active", deprecated: null });
    const view = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(view).toMatchObject({ status: "active", deprecations: [] });
    expect((await post("/api/dev/components/card-deck/undeprecate", {})).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE event = 'component-undeprecated'").first<{ n: number }>())!.n).toBe(2);
  });

  it("filters lists and search with deprecated=exclude|include|only", async () => {
    await publishPool();
    await post("/api/dev/components/card-deck/deprecate", {});
    const names = async (path: string) => ((await (await get(`${path}${path.includes("?") ? "&" : "?"}sort=name`)).json()) as ComponentList).components.map((c) => c.name);
    expect(await names("/api/components")).toEqual(["acme/card-deck", "acme/random-pool"]);
    expect(await names("/api/components?deprecated=include")).toEqual(["acme/card-deck", "acme/random-pool"]);
    expect(await names("/api/components?deprecated=exclude")).toEqual(["acme/random-pool"]);
    expect(await names("/api/components?deprecated=only")).toEqual(["acme/card-deck"]);
    expect(((await (await get("/api/components?deprecated=exclude")).json()) as ComponentList).total).toEqual({ count: 1, approximate: false });
    const found = async (value: string) => ((await (await get(`/api/components?q=a&deprecated=${value}`)).json()) as ComponentList).components.map((c: { name: string }) => c.name);
    expect(await found("only")).toEqual(["acme/card-deck"]);
    expect(await found("exclude")).toEqual(["acme/random-pool"]);
    expect((await get("/api/components?deprecated=maybe")).status).toBe(400);
    expect((await get("/components.json?deprecated=only")).status).toBe(200);
    expect(await (await get("/components.txt?deprecated=exclude")).text()).not.toContain("acme/card-deck");
  });

  it("works the same for recipes, with a recipe as the replacement", async () => {
    githubFor({ ...release("acme/poker-night-recipe", "v0.1.0", "poker-night-0.1.0.tar", 21) });
    await publishRecipe();
    const res = await post("/api/dev/recipes/poker-night/deprecate", { replacement: "acme/poker-night" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("cannot replace itself");
    expect((await post("/api/dev/recipes/poker-night/deprecate", { replacement: "acme/card-deck" })).status).toBe(400);
    expect((await post("/api/dev/recipes/poker-night/deprecate", { replacement: "acme/poker-night-two" })).status).toBe(400);
    expect((await post("/api/dev/recipes/poker-night/deprecate", {})).status).toBe(200);
    const v = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    expect(v).toMatchObject({ status: "deprecated", deprecations: [{ name: "acme/poker-night", status: "deprecated", reason: "owner-deprecated", via: [] }] });
    expect(((await (await get("/api/recipes?deprecated=only")).json()) as RecipeList).recipes).toHaveLength(1);
    expect(((await (await get("/api/recipes?deprecated=exclude")).json()) as RecipeList).recipes).toHaveLength(0);
    expect(await (await get("/recipes/poker-night.txt")).text()).toContain("DEPRECATION WARNING: acme/poker-night 0.1.0 is deprecated by its publisher");
    const mine = (await (await handle(api(cookie, "GET", "/api/dev/recipes"), env, deps)).json()) as { recipes: { status: string; deprecated: unknown }[] };
    expect(mine.recipes[0]).toMatchObject({ status: "deprecated", deprecated: { reason: "owner-deprecated", replacement: null } });
    expect((await post("/api/dev/recipes/poker-night/undeprecate", {})).status).toBe(200);
    expect(((await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView).status).toBe("active");
  });

  it("is for the owner only, with write scope", async () => {
    const other = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    expect((await post("/api/dev/components/card-deck/deprecate", {}, other)).status).toBe(404);
    expect((await post("/api/dev/components/card-deck/undeprecate", {}, other)).status).toBe(404);
    expect((await post("/api/dev/components/nope/deprecate", {})).status).toBe(404);
    expect((await post("/api/dev/components/card-deck/deprecate", {}, null)).status).toBe(401);
    expect((await post("/api/dev/components/card-deck/deprecate", { replacement: 5 })).status).toBe(400);
    const read = (await (await post("/api/dev/keys", { name: "reader", scope: "read" })).json()) as { key: string };
    const manage = (await (await post("/api/dev/keys", { name: "writer", scope: "manage" })).json()) as { key: string };
    const asKey = (key: string, path: string) => handle(api(null, "POST", path, {}, { Authorization: `Bearer ${key}` }), env, deps);
    expect((await asKey(read.key, "/api/dev/components/card-deck/deprecate")).status).toBe(403);
    expect((await asKey(manage.key, "/api/dev/components/card-deck/deprecate")).status).toBe(200);
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).status).toBe("deprecated");
  });
});

describe("deprecation reaches what uses a flagged component", () => {
  beforeEach(publishChain);

  it("shows nothing while nothing is flagged", async () => {
    const report = (await (await get("/api/recipes/poker-night/0.1.0/deprecations")).json()) as DeprecationReport;
    expect(report).toEqual({ name: "acme/poker-night", version: "0.1.0", status: "active", affected: false, checked: 6, deprecations: [] });
  });

  it("resolves the full tree: direct components and what they depend on", async () => {
    await post("/api/dev/components/random-pool/deprecate", { replacement: "acme/card-deck" });
    const since = deps.now().toISOString();
    const pool = { name: "acme/random-pool", version: "0.1.0", status: "deprecated", reason: "owner-deprecated", since, replacement: "acme/card-deck", via: ["acme/card-deck"] };

    const report = (await (await get("/api/recipes/poker-night/0.1.0/deprecations")).json()) as DeprecationReport;
    expect(report).toEqual({ name: "acme/poker-night", version: "0.1.0", status: "active", affected: true, checked: 6, deprecations: [pool] });
    expect(((await (await get("/api/recipes/poker-night/latest/deprecations")).json()) as DeprecationReport).deprecations).toEqual([pool]);

    const recipe = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    expect(recipe.status).toBe("active");
    expect(recipe.deprecations).toEqual([pool]);
    expect(recipe.components.map((c) => c.deprecation)).toEqual([null, null, null, null, null]);
    expect(((await (await get("/api/recipes")).json()) as RecipeList).recipes[0].deprecations).toEqual([pool]);
    expect(((await (await get("/api/recipes?q=poker")).json()) as RecipeList).recipes[0].deprecations).toEqual([pool]);
    expect(((await (await get("/recipes/poker-night.json")).json()) as RecipeVersionView).deprecations).toEqual([pool]);
    const text = await (await get("/recipes/poker-night.txt")).text();
    expect(text).toContain("DEPRECATION WARNING: acme/random-pool 0.1.0 is deprecated by its publisher (owner-deprecated, since 2026-10-16T10:00:00.000Z, used by acme/card-deck); replacement acme/card-deck");
    expect(text).toContain(`Deprecation tree: ${BASE}/api/recipes/poker-night/0.1.0/deprecations`);
    expect(await (await get("/recipes.txt")).text()).toContain("  DEPRECATION WARNING: acme/random-pool 0.1.0");
    expect(((await (await get("/api/recipes/poker-night/0.1.0/bundle")).json()) as BundleLink).deprecations).toEqual([pool]);

    const card = (await (await get("/api/components/card-deck")).json()) as ComponentVersionView;
    expect(card.status).toBe("active");
    expect(card.dependencies).toEqual([{ name: "acme/random-pool", version: "0.1.0" }]);
    expect(card.deprecations).toEqual([pool]);
    expect(await (await get("/components/card-deck.txt")).text()).toContain("DEPRECATION WARNING: acme/random-pool 0.1.0");
    expect(await (await get("/components/card-deck.txt")).text()).toContain("Depends on components: acme/random-pool 0.1.0");
    const cardReport = (await (await get("/api/components/card-deck/0.1.0/deprecations")).json()) as DeprecationReport;
    expect(cardReport).toMatchObject({ affected: true, checked: 1, deprecations: [{ name: "acme/random-pool", via: ["acme/card-deck"] }] });
    expect(((await (await get("/api/components/random-pool")).json()) as ComponentVersionView).deprecations).toEqual([{ ...pool, via: [] }]);
  });

  it("marks the direct component on the recipe and merges how it is reached", async () => {
    await post("/api/dev/components/card-deck/deprecate", {});
    await post("/api/dev/components/random-pool/deprecate", {});
    const recipe = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    expect(recipe.deprecations.map((d) => [d.name, d.via])).toEqual([["acme/card-deck", ["acme/poker-night"]], ["acme/random-pool", ["acme/card-deck"]]]);
    expect(recipe.components.find((c) => c.id === "deck")!.deprecation).toMatchObject({ name: "acme/card-deck", status: "deprecated" });
    expect(recipe.components.find((c) => c.id === "seats")!.deprecation).toBeNull();
  });

  it("covers every version of a flagged name, and clears with undeprecate", async () => {
    await post("/api/dev/components/random-pool/deprecate", {});
    githubFor({ ...release("acme/random-pool", "v0.2.0", "random-pool-0.2.0.tar", 42) });
    expect((await post("/api/dev/components", POOL((e) => ((e.version = "0.2.0"), (e.digest = digest("2")), (e.source.tag = "v0.2.0"), (e.bundle.asset = "random-pool-0.2.0.tar"))))).status).toBe(201);
    expect(((await (await get("/api/components/random-pool/0.2.0")).json()) as ComponentVersionView).status).toBe("deprecated");
    await post("/api/dev/components/random-pool/undeprecate", {});
    expect(((await (await get("/api/recipes/poker-night/0.1.0/deprecations")).json()) as DeprecationReport).deprecations).toEqual([]);
  });

  it("stops at a cycle", async () => {
    await env.DB.prepare("INSERT INTO component_dependencies (component_id, version, dependency_name, dependency_version) SELECT id, '0.1.0', 'acme/card-deck', '0.1.0' FROM components WHERE name = 'acme/random-pool'").run();
    await post("/api/dev/components/random-pool/deprecate", {});
    const report = (await (await get("/api/recipes/poker-night/0.1.0/deprecations")).json()) as DeprecationReport;
    expect(report.deprecations.map((d) => d.name)).toEqual(["acme/random-pool"]);
    expect(report.deprecations[0].via).toEqual(["acme/card-deck"]);
  });

  it("answers 404 for an unknown or unlisted version", async () => {
    expect((await get("/api/recipes/poker-night/9.9.9/deprecations")).status).toBe(404);
    expect((await get("/api/components/nope/0.1.0/deprecations")).status).toBe(404);
    expect((await get("/api/recipes/Bad/0.1.0/deprecations")).status).toBe(404);
  });
});

describe("account deletion keeps the catalogue and orphans it", () => {
  const deleteAccount = async () => {
    const res = await handle(api(cookie, "DELETE", "/api/dev/me", { confirm: "george" }), env, deps);
    expect(res.status).toBe(200);
  };

  beforeEach(async () => {
    await publishChain();
    await post("/api/dev/components/card-deck/deprecate", { replacement: "acme/random-pool" });
  });

  it("keeps every catalogue row and the search rows, with a null owner and the orphaned flag", async () => {
    const before = (await env.DB.prepare("SELECT (SELECT COUNT(*) FROM component_fts) + (SELECT COUNT(*) FROM recipe_fts) AS n").first<{ n: number }>())!.n;
    await deleteAccount();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM developers").first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare("SELECT (SELECT COUNT(*) FROM component_fts) + (SELECT COUNT(*) FROM recipe_fts) AS n").first<{ n: number }>())!.n).toBe(before);
    for (const [table, n] of [["recipes", 1], ["recipe_versions", 1], ["recipe_slots", 5], ["components", 6], ["component_versions", 6], ["component_interfaces", 8], ["component_dependencies", 1]] as const) {
      expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n, table).toBe(n);
    }
    const rows = (await env.DB.prepare("SELECT name, developer_id, deprecated_at, deprecated_reason, replacement FROM components WHERE name IN ('acme/card-deck', 'acme/random-pool') ORDER BY name").all<Record<string, unknown>>()).results;
    const at = deps.now().toISOString();
    expect(rows).toEqual([
      { name: "acme/card-deck", developer_id: null, deprecated_at: at, deprecated_reason: "owner-deleted", replacement: "acme/random-pool" },
      { name: "acme/random-pool", developer_id: null, deprecated_at: at, deprecated_reason: "owner-deleted", replacement: null },
    ]);
    expect((await env.DB.prepare("SELECT developer_id, deprecated_reason FROM recipes").first())).toEqual({ developer_id: null, deprecated_reason: "owner-deleted" });
  });

  it("keeps them listed and searchable, with no publisher and an orphaned warning everywhere", async () => {
    await deleteAccount();
    const at = deps.now().toISOString();
    const own = { name: "acme/card-deck", version: "0.1.0", status: "orphaned", reason: "owner-deleted", since: at, replacement: "acme/random-pool", via: [] };
    const list = (await (await get("/api/components")).json()) as ComponentList;
    expect(list.total).toEqual({ count: 6, approximate: false });
    expect(list.components.every((c) => c.status === "orphaned" && c.publisher === null)).toBe(true);
    expect(list.components.find((c) => c.name === "acme/card-deck")!.deprecations).toEqual([own, { name: "acme/random-pool", version: "0.1.0", status: "orphaned", reason: "owner-deleted", since: at, via: ["acme/card-deck"] }]);
    expect(((await (await get("/api/components?q=pool")).json()) as ComponentList).components[0].status).toBe("orphaned");
    expect(((await (await get("/api/components?deprecated=only")).json()) as ComponentList).total).toEqual({ count: 6, approximate: false });
    expect(((await (await get("/api/components?deprecated=exclude")).json()) as ComponentList).total).toEqual({ count: 0, approximate: false });

    const recipe = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    expect(recipe).toMatchObject({ status: "orphaned", publisher: null });
    const chain = ["acme/poker-night", "acme/card-deck", "acme/random-pool"];
    expect(recipe.deprecations.filter((d) => chain.includes(d.name)).map((d) => [d.name, d.status, d.via])).toEqual([["acme/poker-night", "orphaned", []], ["acme/card-deck", "orphaned", ["acme/poker-night"]], ["acme/random-pool", "orphaned", ["acme/card-deck"]]]);
    expect(recipe.components.find((c) => c.id === "deck")!.deprecation).toMatchObject({ status: "orphaned" });

    const text = await (await get("/recipes/poker-night.txt")).text();
    expect(text).toContain("DEPRECATION WARNING: acme/poker-night 0.1.0 is orphaned: its publisher deleted their account");
    expect(text).toContain("DEPRECATION WARNING: acme/card-deck 0.1.0 is orphaned");
    expect(text).toContain("Publisher: none (the publisher deleted their account)");
    expect(text).toContain("bundle-unavailable");
    expect(JSON.stringify(recipe)).not.toMatch(/george|developerId|developer_id/i);
    const xml = await (await get("/sitemap.xml")).text();
    expect(xml).toContain("/recipes/poker-night");
  });

  it("serves a public release without any token and records no token use", async () => {
    await deleteAccount();
    calls.length = 0;
    const res = await get("/api/recipes/poker-night/0.1.0/bundle");
    expect(res.status).toBe(200);
    const link = (await res.json()) as BundleLink;
    expect(link).toMatchObject({ status: "available", name: "acme/poker-night", asset: "poker-night-0.1.0.tar", assetDigest: EXAMPLE_BUNDLE_DIGEST });
    expect(link.url).toMatch(new RegExp(`^${BASE}/dl/`));
    expect(link.expiresAt).not.toBeNull();
    const file = await handle(new Request(link.url!), env, deps);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("BUNDLEBYTES");
    expect(file.headers.get("Content-Disposition")).toBe('attachment; filename="poker-night-0.1.0.tar"');
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) expect(c.headers.get("Authorization"), c.url).toBeNull();
    expect(calls.at(-1)!.headers.get("Accept")).toBe("application/octet-stream");
    expect(JSON.stringify(link)).not.toContain("api.github.com");
  });

  it("marks bundle-unavailable when the release is private or gone", async () => {
    await deleteAccount();
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { releaseStatus: 404 }));
    const res = await get("/api/components/card-deck/0.1.0/bundle");
    expect(res.status).toBe(200);
    const link = (await res.json()) as BundleLink;
    expect(link).toMatchObject({ status: "bundle-unavailable", url: null, expiresAt: null, name: "acme/card-deck", asset: "card-deck-0.1.0.tar" });
    expect(link.deprecations.length).toBeGreaterThan(0);
    githubFor(release("acme/card-deck", "v0.1.0", "other.tar", 11));
    expect(((await (await get("/api/components/card-deck/0.1.0/bundle")).json()) as BundleLink).status).toBe("bundle-unavailable");
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { releaseStatus: 500 }));
    expect((await get("/api/components/card-deck/0.1.0/bundle")).status).toBe(502);
    githubFor(release("acme/card-deck", "v0.1.0", "card-deck-0.1.0.tar", 11, { digest: digest("f") }));
    expect((await get("/api/components/card-deck/0.1.0/bundle")).status).toBe(502);
  });

  it("keeps the name taken, and nobody can unlist, deprecate or undeprecate it", async () => {
    await deleteAccount();
    const other = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    await saveToken(other);
    const res = await post("/api/dev/components", nextComponent("0.2.0", digest("e")), other);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("deleted their account");
    for (const path of ["/api/dev/components/card-deck/undeprecate", "/api/dev/components/card-deck/deprecate"]) expect((await post(path, {}, other)).status, path).toBe(404);
    expect((await del("/api/dev/components/card-deck", other)).status).toBe(404);
    expect(((await (await get("/api/components/card-deck")).json()) as ComponentVersionView).status).toBe("orphaned");
  });

  it("does not count orphaned entries against a new developer's limit", async () => {
    await deleteAccount();
    cookie = await signIn(env, deps);
    await saveToken();
    const mine = (await (await handle(api(cookie, "GET", "/api/dev/components"), env, deps)).json()) as { components: unknown[] };
    expect(mine.components).toEqual([]);
  });

  it("refuses to delete a developer row that still owns an unflagged entry", async () => {
    const dev = (await env.DB.prepare("SELECT id FROM developers").first<{ id: string }>())!.id;
    await env.DB.prepare("UPDATE components SET deprecated_at = NULL, deprecated_reason = NULL").run();
    await expect(env.DB.prepare("DELETE FROM developers WHERE id = ?").bind(dev).run()).rejects.toThrow();
  });
});

describe("build reports", () => {
  const ourpoker = "ourapps-ae/ourpoker";
  const reports = [report060, report080] as unknown as Mutable[];

  // OurPoker as migration 0022 leaves it: the name and owner, no listed version, and the digests it published.
  async function ourpokerBeforeTheRound() {
    const dev = (await env.DB.prepare("SELECT id FROM developers WHERE github_id = 42").first<{ id: string }>())!.id;
    await env.DB.prepare("INSERT INTO recipes (id, name, scope, slug, developer_id, repo, created_at, updated_at) VALUES ('ourpoker', ?, 'ourapps-ae', 'ourpoker', ?, 'ourapps-ae/ourpoker', '2026-11-01', '2026-11-20')").bind(ourpoker, dev).run();
    for (const r of reports) await env.DB.prepare("INSERT INTO published_digests (kind, name, version, digest, published_at) VALUES ('recipe', ?, ?, ?, ?)").bind(ourpoker, r.recipe.version, r.recipe.digest, `${r.date}T00:00:00Z`).run();
  }

  const send = (r: unknown, c: string | null = cookie, slug = "ourpoker") => post(`/api/dev/recipes/${slug}/reports`, r, c);
  // The reports are of 16 and 20 November; sessions last 30 days, so sign in again on the later day.
  beforeEach(async () => {
    deps.advance(40 * 86_400_000);
    cookie = await signIn(env, deps);
  });

  it("keeps the two OurPoker reports of versions no longer listed, newest first, and answers the same report again unchanged", async () => {
    await ourpokerBeforeTheRound();
    for (const r of reports) {
      const res = await send(r);
      expect(res.status, await res.clone().text()).toBe(201);
      expect(await res.json()).toMatchObject({ status: "published", name: ourpoker, version: r.recipe.version });
    }
    const again = await send(reports[0]);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { status: string }).status).toBe("unchanged");
    const list = (await (await get("/api/recipes/ourpoker/reports")).json()) as BuildReportList;
    expect(list.currentVersion).toBeNull();
    expect(list.reports.map((r) => [r.version, r.date, r.current, r.activeMinutes, r.costUsd])).toEqual([["0.8.0", "2026-11-20", false, 27.6, 1.85], ["0.6.0", "2026-11-16", false, 28.1, 3.2]]);
    expect(list.reports[0]!.report).toEqual(report080);
    const one = (await (await get(`/api/recipes/ourpoker/reports/${list.reports[1]!.id}`)).json()) as BuildReportView;
    expect(one.results).toHaveLength(7);
    expect((await get("/api/recipes/ourpoker/reports/0000")).status).toBe(404);
  });

  it("refuses a report from a non-curator, of a version or digest never published, with a secret, or with fields out of shape", async () => {
    await ourpokerBeforeTheRound();
    const sue = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    expect((await send(reports[1], sue)).status).toBe(403);
    const error = async (patch: (r: Mutable) => void) => {
      const r = structuredClone(reports[1]!);
      patch(r);
      const res = await send(r);
      return [res.status, ((await res.json()) as { error: string }).error] as const;
    };
    expect(await error((r) => (r.recipe.version = "0.9.0"))).toEqual([422, `${ourpoker} 0.9.0 has never been published`]);
    expect((await error((r) => (r.recipe.digest = `sha256:${"0".repeat(64)}`)))[0]).toBe(422);
    expect((await error((r) => (r.prompt = `use ghp_${"a".repeat(36)}`)))[0]).toBe(400);
    expect((await error((r) => (r.problems = ["one\ttwo"])))[1]).toContain("problems must list");
    expect((await error((r) => (r.extra = 1)))[1]).toContain("report.extra is not a field");
    expect((await error((r) => (r.format = 2)))[1]).toContain("format-refused");
    expect((await error((r) => (r.rating.score = 11)))[1]).toContain("rating.score");
    expect((await error((r) => (r.results[0].built = "yes")))[1]).toContain("results[0].built");
    expect((await error((r) => (r.recipe.name = "ourapps-ae/other")))[1]).toContain("not ourapps-ae/ourpoker");
    expect((await error((r) => (r.date = "2099-01-01")))[1]).toContain("future");
  });

  it("makes a version integration-tested when it is published after a fully built report of it", async () => {
    const dev = (await env.DB.prepare("SELECT id FROM developers WHERE github_id = 42").first<{ id: string }>())!.id;
    const digest = (recipe() as Mutable).digest as string;
    await env.DB.prepare("INSERT INTO recipes (id, name, scope, slug, developer_id, repo, created_at, updated_at) VALUES ('pn', 'acme/poker-night', 'acme', 'poker-night', ?, 'acme/poker-night-recipe', '2026-11-01', '2026-11-01')").bind(dev).run();
    await env.DB.prepare("INSERT INTO published_digests (kind, name, version, digest, published_at) VALUES ('recipe', 'acme/poker-night', '0.1.0', ?, '2026-11-01')").bind(digest).run();
    const report = structuredClone(reports[1]!);
    report.recipe = { name: "acme/poker-night", version: "0.1.0", digest };
    expect((await send(report, cookie, "poker-night")).status).toBe(201);
    await publishRecipe();
    expect(((await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView).quality).toMatchObject({ level: "integration-tested" });
  });

  it("shows reports on the recipe page and text page, notes an older version, and makes a fully built version integration-tested", async () => {
    await publishRecipe();
    const listed = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    const current = structuredClone(reports[1]!);
    current.recipe = { name: "acme/poker-night", version: "0.1.0", digest: listed.digest };
    expect((await send(current, cookie, "poker-night")).status).toBe(201);
    await env.DB.prepare("INSERT INTO published_digests (kind, name, version, digest, published_at) VALUES ('recipe', 'acme/poker-night', '0.0.9', ?, '2026-11-01')").bind(`sha256:${"9".repeat(64)}`).run();
    const older = structuredClone(reports[0]!);
    older.recipe = { name: "acme/poker-night", version: "0.0.9", digest: `sha256:${"9".repeat(64)}` };
    older.results[0].built = false;
    expect((await send(older, cookie, "poker-night")).status).toBe(201);
    const view = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    expect(view.quality).toMatchObject({ level: "integration-tested" });
    expect(view.buildReports.map((r) => [r.version, r.current])).toEqual([["0.1.0", true], ["0.0.9", false]]);
    const text = await (await get("/recipes/poker-night.txt")).text();
    expect(text).toContain("Build reports (2): agents building an application from this recipe, newest first");
    expect(text).toContain("- 0.1.0, 2026-11-20: OpenCode 2.3.2, anthropic/claude-opus-5-5; 27.6 active minutes, US$1.85; built 7 of 7 targets; 6 problems; rated 7/10; ");
    expect(text).toContain("- 0.0.9 (not the current version), 2026-11-16: OpenCode, anthropic/claude-opus-5-5; 28.1 active minutes, US$3.20; built 6 of 7 targets;");
  });
});

describe("build steps on the recipe text page", () => {
  const generic = (page: string, digest: string) => {
    const at = (s: string) => page.indexOf(s);
    const steps = [
      "python3 -m aepm fetch poker-night@0.1.0 --with-dependencies --store store",
      `tar -xf store/objects/${digest.slice(7)}.tar INSTRUCTIONS.md`,
      "python3 -m aepm questions poker-night@0.1.0 --store store",
      "python3 -m aepm design poker-night@0.1.0 --store store --answers answers.json --out definition.json",
      "python3 -m aepm doctor poker-night@0.1.0 --store store --answers answers.json",
      "add --install to install the missing ones it can",
      "python3 -m aepm resolve definition.json",
      "python3 -m aepm install definition.json --lock lock.json --store store --policy policy.json --target app",
      "python3 -m aepm verify app --policy policy.json --trusted",
      "Build and run each target as INSTRUCTIONS.md says",
    ].map(at);
    expect(steps.every((x, i) => x > 0 && (i === 0 || x > steps[i - 1]!)), JSON.stringify(steps)).toBe(true);
  };

  it("gives the generic aepm steps with the shown version's digest, and the recipe's own Building it section under them", async () => {
    await publishRecipe((e) => (e.page.description = "Poker Night.\n\n## Building it\n\nWhen the server runs on Cloudflare: deploy the server with `npm run deploy`, then the web client.\n\n```\n# not a heading\n```\n\n### Repository\n\nPush it.\n\n## Status\n\nTested."));
    const view = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    const page = await (await get("/recipes/poker-night.txt")).text();
    generic(page, view.digest);
    const own = page.indexOf('From the recipe (its description, "Building it")');
    expect(own).toBeGreaterThan(page.indexOf("--trusted"));
    expect(own).toBeLessThan(page.indexOf("Questions ("));
    expect(page).toContain("When the server runs on Cloudflare: deploy the server with `npm run deploy`, then the web client.\n\n```\n# not a heading\n```\n\n### Repository\n\nPush it.\n\nQuestions");
    expect(page.slice(own)).not.toContain("Tested.");
    expect(page).not.toContain("cd app/server && npm ci");
  });

  it("gives only the generic steps when the description has no Building it section, and cuts a long one", async () => {
    await publishRecipe();
    const view = (await (await get("/api/recipes/poker-night")).json()) as RecipeVersionView;
    const page = await (await get("/recipes/poker-night.txt")).text();
    generic(page, view.digest);
    expect(page).not.toContain("From the recipe");
    const long = recipeText({ ...view, description: `## Building it\n\n${"step and step again ".repeat(2000)}` }, BASE);
    expect(long).toContain(`The rest: ${BASE}/recipes/poker-night/details.txt?version=0.1.0`);
    expect(long.length).toBeLessThan(60_000);
  });
});
