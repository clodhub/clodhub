import { describe, expect, it } from "vitest";
import { SIGNATURES_NOTE, classDescriptor, exampleComponentEntry, exampleRecipeEntry, slotClass, summariseFoundations, type ComponentSummary, type PackageDetails, type ComponentVersionView, type Deprecation, type RecipeSummary, type RecipeVersionView } from "@my/store-shared";
import { escapeHtml } from "../html.js";
import { classBody, componentBody, componentCard, deprecationBanner, detailsBody, recipeBody, recipeCard, splitDescription } from "./library.js";

const origin = "https://ourapps.app";
const publisher = { slug: "dana", displayName: "Dana" };

const image = { url: `${origin}/images/${"e".repeat(64)}.png`, thumbnail: `${origin}/images/${"f".repeat(64)}.webp`, caption: "The table during a hand", platform: "web", width: 1280, height: 800 };
const versionCommon = {
  platforms: ["web", "server", "ios", "macos", "android"],
  licence: "Apache-2.0",
  quality: null,
  channel: "features" as const,
  vulnerabilities: 0,
  thumbnail: image.thumbnail,
  downloads: 12,
  updatedAt: "2026-10-16T10:00:00.000Z",
  release: { channel: "features" as const, fixes: [] },
  line: { line: "0.1", securityReleases: [] },
  images: [image],
  vulnerabilitySummary: { count: 0, checkedAt: "2026-10-17T10:00:00.000Z", url: `${origin}/api/components/card-deck/0.1.0/vulnerabilities` },
  vulnerabilityWaivers: [],
  versionDownloads: 4,
};

function recipeView(patch: Partial<RecipeVersionView> = {}): RecipeVersionView {
  const e = exampleRecipeEntry();
  const r = e.recipe;
  const suitability = exampleComponentEntry().suitability;
  return {
    ...versionCommon,
    foundations: summariseFoundations(e.foundations, `${origin}/api/recipes/poker-night/0.1.0/details`), foundationEvidence: "publisher-declared",
    name: r.name,
    slug: "poker-night",
    version: r.version,
    title: r.title,
    summary: r.summary,
    category: r.category,
    tags: r.tags,
    targets: r.targets,
    publishedAt: "2026-10-16T10:00:00.000Z",
    publisher,
    repository: e.source.repository,
    url: `${origin}/recipes/poker-night`,
    status: "active",
    deprecations: [],
    digest: e.digest,
    source: e.source,
    bundle: { ...e.bundle, url: `${origin}/api/recipes/poker-night/0.1.0/bundle` },
    description: e.page.description,
    diagram: `${origin}/api/recipes/poker-night/0.1.0/diagram.svg`,
    components: r.components.map((c) => ({
      ...c,
      declaration: slotClass(classDescriptor(c.class, e.foundations)!),
      preferred: { ...c.preferred, url: c.id === "deck" ? `${origin}/components/card-deck` : null },
      catalogue: c.id === "deck" ? { description: "A shuffled deck.", suitability, guardians: ["Example Guardian Ltd"], quality: null, thumbnail: null } : null,
      deprecation: null,
      alternatives: { count: c.id === "seats" ? 1 : 0, url: `${origin}/components?class=${encodeURIComponent(c.class.name)}` },
    })),
    jobs: r.jobs,
    scale: r.scale,
    questions: r.questions,
    connections: r.connections,
    tests: r.tests,
    instructions: r.instructions,
    buildReports: [],
    versions: [{ version: r.version, digest: e.digest, publishedAt: "2026-10-16T10:00:00.000Z", channel: "features", fixes: [] }],
    ...patch,
  };
}

function componentView(patch: Partial<ComponentVersionView> = {}): ComponentVersionView {
  const e = exampleComponentEntry();
  return {
    ...versionCommon,
    foundations: summariseFoundations(e.foundations, `${origin}/api/components/card-deck/0.1.0/details`), foundationEvidence: "publisher-declared",
    name: e.name,
    slug: "card-deck",
    version: e.version,
    description: e.description,
    category: "games/cards",
    class: { name: "ourapps-ae/card-deck-class", version: "1.0.0", title: "Card deck" },
    tags: e.tags,
    targets: e.targets,
    provides: e.provides,
    requires: e.requires,
    publishedAt: "2026-10-16T10:00:00.000Z",
    publisher,
    repository: e.source.repository,
    url: `${origin}/components/card-deck`,
    status: "active",
    deprecations: [],
    digest: e.digest,
    guardians: e.guardians,
    settings: e.settings,
    interfaceDigests: e.interfaceDigests,
    interfaceModules: e.interfaceModules,
    dependencies: [],
    suitability: e.suitability,
    migration: null,
    source: e.source,
    bundle: { ...e.bundle, url: `${origin}/api/components/card-deck/0.1.0/bundle` },
    versions: [{ version: e.version, digest: e.digest, publishedAt: "2026-10-16T10:00:00.000Z", channel: "features", fixes: [] }],
    usedBy: [{ name: "acme/poker-night", slug: "poker-night", title: "Poker Night", version: "0.1.0", url: `${origin}/recipes/poker-night`, slots: [{ id: "deck", preferred: true }, { id: "spare", preferred: false }] }],
    ...patch,
  };
}

describe("recipe page", () => {
  it("shows package facts as counts with one link to the lists, after what a reader needs first", () => {
    const text = recipeBody(recipeView(), "latest").html;
    expect(text).toContain("ourapps-ae/card-deck-class"); expect(text).toContain("Behaviour suites: behaviour");
    expect(text).toContain("Package facts"); expect(text).toContain(escapeHtml(SIGNATURES_NOTE)); expect(text).not.toContain("verified record");
    expect(text).toContain('<a href="/recipes/poker-night/details?version=0.1.0">Sources and dependencies</a>');
    expect(text).toMatch(/\d+ upstream sources?, \d+ exact dependenc(y|ies), \d+ class(es)?, \d+ files?/);
    expect(text).not.toContain("Upstream code");
    const order = ['id="what-you-download"', 'id="build-it"', 'id="about"', 'id="questions"', 'id="slots"', 'id="package-facts"'].map((x) => text.indexOf(x));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
  });

  it("shows the start of the description and the rest on request", () => {
    expect(splitDescription("# T\n\nIntro.\n\n## More\n\nRest.")).toEqual(["# T\n\nIntro.\n", "## More\n\nRest."]);
    expect(splitDescription("Only an intro.")).toEqual(["Only an intro.", ""]);
    const html = recipeBody(recipeView({ description: "# Poker Night\n\nIntro text.\n\n## Rules\n\nLong rules." }), "latest").html;
    expect(html.indexOf("Intro text.")).toBeLessThan(html.indexOf("<summary>The full description</summary>"));
    expect(html.indexOf("Long rules.")).toBeGreaterThan(html.indexOf("<summary>The full description</summary>"));
  });
  it("lists each slot with its class, preferred component and the other components of its class", () => {
    const html = recipeBody(recipeView(), "latest").html;
    expect(html).toContain("<th>Slot</th><th>Class</th><th>Preferred component</th><th>Alternatives</th>");
    expect(html).toContain("<code>seats</code>");
    expect(html).toContain("<p>Provides <code>ae/seating</code> 1.0.0</p><p>Requires <code>ae/card-deck</code> 1.0.0</p>");
    expect(html).toContain('<a href="/components/card-deck">acme/card-deck</a>');
    expect(html).toContain('<a href="/components?class=ourapps-ae%2Fseating-class">1 other</a>');
    expect(html).toContain('<a href="/components?class=ourapps-ae%2Fcard-deck-class">0 others</a>');
  });

  it("shows description, diagram, questions, components with suitability and guardians, targets, answer sets and versions", () => {
    const html = recipeBody(recipeView(), "latest").html;
    expect(html).toContain("Poker Night");
    expect(html).toContain("Build an application from the Poker Night recipe");
    expect(html).not.toMatch(/coming soon|aepm create/);
    expect(html).toContain("Poker Night deals a hand");
    expect(html).toContain('src="https://ourapps.app/api/recipes/poker-night/0.1.0/diagram.svg"');
    expect(html).toContain("Publisher's diagram");
    expect(html).toContain("How its components connect");
    expect(html).toContain('href="/api/recipes/poker-night/0.1.0/components.svg" target="_blank"');
    expect(html).toContain('src="/api/recipes/poker-night/0.1.0/components.svg"');
    expect(html.indexOf("components.svg")).toBeLessThan(html.indexOf("diagram.svg"));
    expect(html).toContain("Questions it asks (7)");
    expect(html).toContain("Starting chips?");
    expect(html).toContain("a reference, never a value");
    expect(html).toContain('href="/components/card-deck"');
    expect(html).toContain("Guardians: Example Guardian Ltd");
    expect(html).toContain("not in the catalogue");
    expect(html).toContain("when lessons is yes");
    expect(html).toContain("when (targets includes ios) or (targets includes macos)");
    expect(html).toContain("asked when lessons is yes");
    expect(html).toContain("asked when server is paid");
    expect(html).toContain("fewer than 10 people, occasional use");
    expect(html).toContain("iPhone and iPad");
    expect(html).toContain("Hosting provider");
    expect(html).toContain("<b>web-only</b>");
    expect(html).toContain("<b>0.1.0</b>");
    expect(html).toContain('href="/recipes/poker-night.txt"');
    expect(html).toContain('href="/recipes/poker-night.json"');
    expect(html).toContain("https://github.com/acme/poker-night-recipe/releases/tag/v0.1.0");
  });

  it("links the variants to the shown version when one is chosen", () => {
    const html = recipeBody(recipeView(), "0.1.0").html;
    expect(html).toContain('href="/recipes/poker-night.json?version=0.1.0"');
  });

  it("escapes publisher text and leaves out an absent diagram and empty parts", () => {
    const html = recipeBody(recipeView({ publisher: { slug: "x", displayName: "<img src=x onerror=alert(1)>" }, diagram: null, questions: [], jobs: [], scale: null, description: "<script>x</script>" }), "latest").html;
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Publisher's diagram");
    expect(html).toContain("components.svg");
    expect(html).toContain("This recipe asks no questions.");
    expect(html).not.toContain("Choosing by suitability");
  });

  it("shows jobs and the scale question when the recipe has them", () => {
    const html = recipeBody(recipeView(), "latest").html;
    expect(html).toContain("Choosing by suitability");
    expect(html).toContain("acme/server-host (free), acme/server-host (paid)");
    expect(html).toContain("restricts the candidates first");
  });

  it("names the condition of a job candidate", () => {
    const r = recipeView();
    const html = recipeBody(recipeView({ jobs: [{ ...r.jobs[0], candidates: [{ component: "acme/free-host", profile: "free" }, { component: "acme/server-host", profile: "paid", includedWhen: "server == 'paid'" }, { component: "acme/big-host", profile: "paid", includedWhen: "size(targets) > 2" }] }] }), "latest").html;
    expect(html).toContain("acme/free-host (free), acme/server-host (paid) when server is paid, acme/big-host (paid) when <code>size(targets) &gt; 2</code>");
  });
});

describe("component page", () => {
  it("names the recipes that use it and the slot in each", () => {
    const html = componentBody(componentView(), "latest").html;
    expect(html).toContain('<a href="/recipes/poker-night">Poker Night</a> 0.1.0: slot <code>deck</code>, slot <code>spare</code> as a job candidate');
  });

  it("shows interfaces, suitability, guardians, migration, recipes that use it and versions", () => {
    const html = componentBody(componentView(), "latest").html;
    expect(html).toContain("acme/card-deck");
    expect(html).toContain("What it connects to");
    expect(html).toContain('href="/api/components/card-deck/0.1.0/connections.svg" target="_blank"');
    expect(html).toContain('src="/api/components/card-deck/0.1.0/connections.svg"');
    expect(html).toContain("Example Guardian Ltd");
    expect(html).toContain("ae/card-deck");
    expect(html).toContain('href="/components?requires=ae%2Fcard-deck"');
    expect(html).toContain('href="/components?provides=ae%2Frandom-source"');
    expect(html).toContain("no practical limit");
    expect(html).toContain("No cost");
    expect(html).toContain("This component keeps no data.");
    expect(html).toContain('href="/recipes/poker-night"');
    expect(html).toContain('href="/components/card-deck.json"');
  });

  it("leads with how to use it, its class, interfaces, platforms and settings; package facts as counts", () => {
    const html = componentBody(componentView(), "latest").html;
    expect(html).toContain('{&quot;id&quot;:&quot;card-deck&quot;,&quot;class&quot;:{&quot;name&quot;:&quot;ourapps-ae/card-deck-class&quot;,&quot;version&quot;:&quot;1.0.0&quot;,&quot;digest&quot;:');
    expect(html).toContain("--substitute SLOT=acme/card-deck@0.1.0");
    expect(html).toContain('<a href="/components/card-deck/details?version=0.1.0">Sources and dependencies</a>');
    const order = ['id="what-you-download"', 'id="use-it"', 'id="class"', 'id="platforms"', 'id="settings"', 'id="package-facts"'].map((x) => html.indexOf(x));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
  });

  it("marks an optional requirement", () => {
    const html = componentBody(componentView({ requires: [{ id: "random-source", type: "ae/random-source", version: "1.0.0", optional: true }, { id: "audit", type: "ae/audit", version: "1.0.0" }] }), "latest").html;
    expect(html).toContain('<code>random-source</code> <span class="small muted">optional</span>');
    expect(html).not.toContain('<code>audit</code> <span class="small muted">optional</span>');
  });

  it("describes a data-keeping component and no guardian", () => {
    const html = componentBody(componentView({ guardians: [], usedBy: [], migration: { stores: [{ id: "rooms", schema: { name: "ae/room-state", version: "1.0.0" } }], formats: ["ndjson"], portable: true, requiresStop: true, retentionDays: 30 } }), "latest").html;
    expect(html).toContain("Guardians: none recorded for this version");
    expect(html).toContain("rooms (ae/room-state 1.0.0)");
    expect(html).toContain("it must stop while data moves");
    expect(html).toContain("kept 30 days after removal");
    expect(html).toContain("No listed recipe names it yet.");
  });
});

const orphan: Deprecation = { name: "acme/card-deck", version: "0.1.0", status: "orphaned", reason: "owner-deleted", since: "2026-11-01T09:00:00.000Z", via: [] };
const deprecatedPart: Deprecation = { name: "acme/seating", version: "0.1.0", status: "deprecated", reason: "owner-deprecated", since: "2026-11-02T09:00:00.000Z", replacement: "acme/seating-two", via: ["acme/poker-night"] };

describe("deprecation banner", () => {
  it("shows nothing for an active entry", () => {
    expect(recipeBody(recipeView(), "latest").html).not.toContain("role=\"alert\"");
    expect(componentBody(componentView(), "latest").html).not.toContain("role=\"alert\"");
  });

  it("says an orphaned component is orphaned, since when, and what to do", () => {
    const html = componentBody(componentView({ status: "orphaned", publisher: null, deprecations: [orphan] }), "latest").html;
    expect(html).toContain('role="alert"');
    expect(html).toContain("Orphaned.");
    expect(html).toContain("its publisher deleted their account and nobody maintains it (since 2026-11-01)");
    expect(html).toContain("decide never to update");
    expect(html).toContain("Publisher&#39;s account deleted");
    expect(html).toContain('href="/api/components/card-deck/0.1.0/deprecations"');
  });

  it("lists flagged components under a recipe, with the replacement as a link", () => {
    const html = recipeBody(recipeView({ deprecations: [deprecatedPart] }), "latest").html;
    expect(html).toContain("This recipe uses deprecated or orphaned components.");
    expect(html).toContain("acme/seating 0.1.0 is deprecated by its publisher (since 2026-11-02, used by acme/poker-night)");
    expect(html).toContain('href="/components/seating-two"');
    expect(html).toContain('href="/api/recipes/poker-night/0.1.0/deprecations"');
  });

  it("flags a deprecated recipe itself and links its replacement as a recipe", () => {
    const own: Deprecation = { name: "acme/poker-night", version: "0.1.0", status: "deprecated", reason: "owner-deprecated", since: "2026-11-03T09:00:00.000Z", replacement: "acme/poker-night-two", via: [] };
    const html = deprecationBanner({ name: "acme/poker-night", version: "0.1.0", status: "deprecated", deprecations: [own] }, "recipes").html;
    expect(html).toContain("Deprecated.");
    expect(html).toContain('href="/recipes/poker-night-two"');
    expect(html).not.toContain("uses deprecated");
  });

  it("marks a flagged part in the component table and cards carry a status pill", () => {
    const base = recipeView();
    const view = recipeView({ components: base.components.map((c) => (c.id === "seats" ? { ...c, deprecation: deprecatedPart } : c)), deprecations: [deprecatedPart] });
    expect(recipeBody(view, "latest").html).toContain('<span class="pill warn">Deprecated</span>');
    expect(recipeCard({ ...view, status: "deprecated" }).html).toContain('<span class="pill warn">Deprecated</span>');
    expect(recipeCard({ ...view, deprecations: [deprecatedPart] }).html).toContain("Uses deprecated parts");
    expect(componentCard({ ...componentView(), status: "orphaned", publisher: null, deprecations: [orphan] }).html).toContain('<span class="pill bad">Orphaned</span>');
  });

  it("lists what a component builds on", () => {
    const html = componentBody(componentView({ dependencies: [{ name: "acme/random-pool", version: "0.2.0" }] }), "latest").html;
    expect(html).toContain("Builds on");
    expect(html).toContain('href="/components/random-pool"');
  });
});

describe("cards", () => {
  it("link to the page and filter by category", () => {
    const r: RecipeSummary = { ...recipeView(), publisher };
    expect(recipeCard(r).html).toContain('href="/recipes/poker-night"');
    expect(recipeCard(r).html).toContain('href="/recipes?category=games"');
    const c: ComponentSummary = { ...componentView() };
    const html = componentCard(c).html;
    expect(html).toContain('href="/components/card-deck"');
    expect(html).toContain('Class <a href="/classes/card-deck-class">Card deck</a>');
    expect(html).toContain(`<img class="thumb" src="${image.thumbnail}"`);
    expect(html).toContain("12 downloads");
  });
});

describe("sources and dependencies", () => {
  it("lists every upstream source, dependency, class, file and installed file, each closed until opened", () => {
    const e = exampleComponentEntry();
    const foundations = { ...e.foundations, upstream: [{ name: "left-pad", version: "1.3.0", revision: null, repository: "https://example.org/left-pad", purl: "pkg:npm/left-pad@1.3.0", licence: "MIT", notices: ["notices/left-pad"], delivery: { kind: "build-time" as const, manager: "npm" as const, lock: "package-lock.json", digest: "0".repeat(64), packagePath: "node_modules/left-pad", integrity: "sha512-x" } }], compatibility: { ...e.foundations.compatibility, dependencies: [{ name: "pkg:npm/left-pad", version: "1.3.0", isolation: "isolated" as const }] } };
    const d: PackageDetails = { name: e.name, version: e.version, foundationEvidence: "publisher-declared", foundations };
    const html = detailsBody(d, "components", "card-deck").html;
    expect(html).toContain("<summary><b>Upstream sources (1)</b></summary>");
    expect(html).toContain("<code>pkg:npm/left-pad@1.3.0</code>");
    expect(html).toContain("fetched at build time by npm, pinned by package-lock.json");
    expect(html).toContain("<summary><b>Exact dependencies (1)</b></summary>");
    expect(html).toContain(`<summary><b>Files (${e.foundations.files.length})</b></summary>`);
    expect(html).toContain("ourapps-ae/card-deck-class");
    expect(html).toContain(escapeHtml(SIGNATURES_NOTE));
    expect(html).not.toContain("<details open");
    expect(html).toContain('href="/api/components/card-deck/0.1.0/details"');
  });
});

describe("the format round on pages", () => {
  it("puts the gallery before What you download, and the release card with channel, line and vulnerabilities", () => {
    const html = componentBody(componentView({ images: [image, { ...image, url: `${origin}/images/${"1".repeat(64)}.png`, caption: "Second" }], quality: { level: "reviewed", certified: true, liveTested: null }, release: { channel: "security", fixes: ["GHSA-aaaa-bbbb-cccc"] }, line: { line: "0.1", securityReleases: [{ version: "0.1.1", fixes: ["GHSA-aaaa-bbbb-cccc"], publishedAt: "2026-11-01T00:00:00.000Z" }] }, vulnerabilitySummary: { count: 2, checkedAt: "2026-11-02T00:00:00.000Z", url: `${origin}/api/components/card-deck/0.1.1/vulnerabilities` } }), "latest").html;
    expect(html.indexOf('id="gallery"')).toBeGreaterThan(0);
    expect(html.indexOf('id="gallery"')).toBeLessThan(html.indexOf('id="what-you-download"'));
    expect(html).toContain(`<img class="main-image" src="${image.url}"`);
    expect(html).toContain('data-image="1"');
    expect(html).toContain('<span class="pill badge-quality" title="Quality level from verified evidence">Reviewed</span>');
    expect(html).toContain("Certified");
    expect(html).toContain("<b>security</b>: fixes GHSA-aaaa-bbbb-cccc");
    expect(html).toContain('<a href="/components/card-deck?version=0.1.1">0.1.1</a> fixes GHSA-aaaa-bbbb-cccc');
    expect(html).toContain('<span class="pill badge-vulnerable">2</span>');
    expect(html).toContain("<th>Channel</th>");
  });

  it("groups the questions by ask and shows follow-ups with the answer that asks them", () => {
    const html = recipeBody(recipeView(), "latest").html;
    const at = ["Ask the person (2)", "Ask unless the request settles it (2)", "Defaults (3)"].map((h) => html.indexOf(h));
    expect(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1]!))).toBe(true);
    expect(html).toContain("Follow-up: asked when lessons is yes");
    expect(html).toContain("Follow-up: asked when server is paid");
  });

  it("compares a class's implementations side by side", () => {
    const html = classBody({ name: "ourapps-ae/card-deck-class", slug: "card-deck-class", version: "1.0.0", title: "Card deck", summary: "A deck", category: "games/cards", presentation: "visual", implementations: 2, publisher: null, url: "", digest: "c".repeat(64), provides: [], requires: [], settings: { type: "object", properties: {}, required: [], additionalProperties: false }, suites: [{ id: "behaviour", argv: ["node", "check.mjs"], network: false, timeoutSeconds: 30 }], versions: [{ version: "1.0.0", digest: "c".repeat(64), publishedAt: "2026-11-01T00:00:00.000Z" }], implementationList: [{ name: "acme/card-deck", slug: "card-deck", version: "0.1.0", description: "A deck", thumbnail: image.thumbnail, quality: { level: "integration-tested", certified: false, liveTested: null }, platforms: ["web", "ios"], downloads: 40, vulnerabilities: 0, url: "" }, { name: "acme/fancy-deck", slug: "fancy-deck", version: "1.0.0", description: "Fancy", thumbnail: null, quality: null, platforms: ["web"], downloads: 3, vulnerabilities: null, url: "" }] }).html;
    expect(html).toContain("Implementations (2)");
    expect(html).toContain('<a href="/components/card-deck">acme/card-deck</a> 0.1.0');
    expect(html).toContain("Integration-tested");
    expect(html).toContain("not assessed");
    expect(html).toContain("not checked");
    expect(html).toContain("<code>node check.mjs</code>");
  });
});

describe("build reports on the recipe page", () => {
  const report = (version: string, current: boolean, date: string) => ({
    id: `id${version.replace(/\./g, "")}`, version, digest: `sha256:${"a".repeat(64)}`, date, publishedAt: `${date}T12:00:00Z`, current,
    agent: { harness: "OpenCode 2.3.2", model: "anthropic/claude-opus-5-5" }, activeMinutes: 27.6, costUsd: 1.85,
    results: [{ target: "server", built: true, tested: "37 of 37 tests", ran: "deployed" }, { target: "ios", built: false, tested: "<b>not built</b>", ran: "not launched" }],
    problems: ["a first deploy failed"], rating: { score: 7, of: 10, by: "the building agent", mostHelpful: "make the first deploy work" }, url: "https://ourapps.app/api/recipes/poker-night/reports/x",
  });

  it("lists each report after Build it with its targets, problems and rating, and notes a report of another version", () => {
    const html = recipeBody(recipeView({ buildReports: [report("0.1.0", true, "2026-11-20"), report("0.0.9", false, "2026-11-16")] }), "latest").html;
    expect(html.indexOf("Build reports (2)")).toBeGreaterThan(html.indexOf("<h2>Build it</h2>"));
    expect(html.indexOf("Build reports (2)")).toBeLessThan(html.indexOf("<h2>About</h2>"));
    expect(html.indexOf("Version 0.1.0, 2026-11-20")).toBeLessThan(html.indexOf("Version 0.0.9, 2026-11-16"));
    expect(html).toContain("27.6 active minutes, US$1.85. Rated 7 of 10 by the building agent.");
    expect(html).toContain("<td>ios</td><td>no</td><td>&lt;b&gt;not built&lt;/b&gt;</td>");
    expect(html).toContain("Problems (1)");
    expect(html).toContain("This report is of version 0.0.9; the current version is 0.1.0.");
    expect(html.match(/the current version is/g)).toHaveLength(1);
  });

  it("shows no section without reports", () => expect(recipeBody(recipeView(), "latest").html).not.toContain("Build reports"));
});

describe("build steps on the recipe page", () => {
  it("lists the aepm steps with the digest, doctor and verify, and the recipe's Building it section", () => {
    const v = recipeView({ description: "Intro.\n\n## Building it\n\nDeploy the server with `npm run deploy` first.\n\n## Status\n\nDone." });
    const html = recipeBody(v, "latest").html;
    const at = (s: string) => html.indexOf(s);
    expect(at(`tar -xf store/objects/${v.digest.slice(7)}.tar INSTRUCTIONS.md`)).toBeGreaterThan(at("python3 -m aepm fetch poker-night@0.1.0"));
    expect(at("python3 -m aepm doctor poker-night@0.1.0 --store store --answers answers.json")).toBeGreaterThan(at("python3 -m aepm design"));
    expect(at("python3 -m aepm verify app --policy policy.json --trusted")).toBeGreaterThan(at("python3 -m aepm install"));
    expect(at("<h3 class=\"mt\">From the recipe</h3>")).toBeGreaterThan(at("--trusted"));
    expect(at("<h3 class=\"mt\">From the recipe</h3>")).toBeLessThan(at("<h2>About</h2>"));
    expect(html).toContain("<code>npm run deploy</code>");
  });

  it("shows no recipe section when the description has no Building it", () => {
    const html = recipeBody(recipeView(), "latest").html;
    expect(html).toContain("python3 -m aepm verify app --policy policy.json --trusted");
    expect(html).not.toContain("From the recipe");
  });
});
