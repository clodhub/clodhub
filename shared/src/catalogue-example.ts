// An invented recipe and components for documentation and tests. Never a real application.
import { GRAMMAR_PATTERNS, componentFacts, interfaceKey, type CategoryNode, type ClassEntry, type ComponentEntry, type EntryPort, type PackageImage, type Port, type RecipeContext, type RecipeEntry, type SettingDeclaration, type SettingValue, type Suitability } from "./catalogue.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { descriptorDigest, type ClassDescriptor, type Foundations } from "./foundations.js";

export const EXAMPLE_DIGEST = `sha256:${"a".repeat(64)}`;
export const EXAMPLE_BUNDLE_DIGEST = `sha256:${"b".repeat(64)}`;
// Descriptive interface document digest for catalogue examples.
export const EXAMPLE_INTERFACE_DIGEST = `sha256:${"c".repeat(64)}`;

const v1 = (type: string) => ({ type, version: "1.0.0" });

// CRC-32 (ISO 3309), as PNG chunks carry it.
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// A complete, structurally valid PNG of the given size: IHDR, one IDAT and IEND, each with its CRC. The IDAT is not
// a real picture; the catalogue checks structure, not pixels.
export function pngHeader(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array([0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1])), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
}

// A complete, structurally valid lossless WebP (one VP8L chunk) of the given size.
export function webpHeader(width: number, height: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  new DataView(data.buffer).setUint32(1, bits >>> 0, true);
  const out = new Uint8Array(20 + data.length);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, out.length - 8, true);
  out.set(new TextEncoder().encode("WEBPVP8L"), 8);
  view.setUint32(16, data.length, true);
  out.set(data, 20);
  return out;
}

const hex = (bytes: Uint8Array) => `sha256:${bytesToHex(sha256(bytes))}`;

// The image the example entries name, and its thumbnail; tests upload these bytes before publishing.
export const EXAMPLE_IMAGE_BYTES = { image: pngHeader(1280, 800), thumbnail: webpHeader(480, 300) };
export const EXAMPLE_IMAGE = { digest: hex(EXAMPLE_IMAGE_BYTES.image), thumbnail: hex(EXAMPLE_IMAGE_BYTES.thumbnail) };
export function exampleImage(platform = "web", more: Partial<PackageImage> = {}): PackageImage {
  return { ...EXAMPLE_IMAGE, caption: "The table during a hand", platform, width: 1280, height: 800, ...more };
}

// The category tree of the example classes, as classes/categories.json holds it.
export function exampleCategories(): { format: 1; categories: CategoryNode[] } {
  const ids = ["games", "games/cards", "games/tables", "delivery", "delivery/hosting", "delivery/apps", "presentation", "presentation/lessons", "tools"];
  const title = (id: string) => id.split("/").pop()!.replace(/^./, (c) => c.toUpperCase());
  return { format: 1, categories: ids.map((id) => ({ id, title: title(id), parent: id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : null })) };
}

const CLASS_FACTS: Record<string, { title: string; summary: string; category: string; presentation: "visual" | "none" }> = {
  "card-deck": { title: "Card deck", summary: "A deck that shuffles, deals and burns cards", category: "games/cards", presentation: "visual" },
  seating: { title: "Seating", summary: "Seats for the people at a table", category: "games/tables", presentation: "none" },
  "server-host": { title: "Server host", summary: "Runs the application's server", category: "delivery/hosting", presentation: "none" },
  "apple-shell": { title: "Apple shell", summary: "The iPhone, iPad and Mac application shell", category: "delivery/apps", presentation: "none" },
  "guided-tour": { title: "Guided tour", summary: "Lessons that walk a new player through the application", category: "presentation/lessons", presentation: "visual" },
};

export function exampleFoundations(slug = "card-deck"): Foundations {
  const type = slug === "club-seating" ? "seating" : slug === "apple-host" ? "apple-shell" : slug;
  const properties: ClassDescriptor["settings"]["properties"] = type === "seating" ? { minimumPlayers: { type: "integer" } } : type === "server-host" ? { targets: { type: "string", pattern: GRAMMAR_PATTERNS.label }, expectedPeople: { type: "integer" }, accountReference: { type: "string", pattern: GRAMMAR_PATTERNS.slug } } : type === "guided-tour" ? { length: { type: "string", pattern: GRAMMAR_PATTERNS.slug } } : {};
  const required = type === "seating" ? ["minimumPlayers"] : type === "server-host" ? ["targets", "expectedPeople"] : type === "guided-tour" ? ["length"] : [];
  const descriptor: ClassDescriptor = {
    format: 2, name: `clodhub/${type}-class`, version: "1.0.0", ...CLASS_FACTS[type]!,
    provides: [{ ...v1(`ae/${type}`), path: `classes/${type}/interface.json`, modules: { web: ["index.mjs"], server: ["index.mjs"] } }],
    requires: type === "seating" ? [v1("ae/card-deck")] : [],
    settings: { type: "object", properties, required, additionalProperties: false },
    inventory: [{ path: `classes/${type}/interface.json`, digest: "c".repeat(64) }, { path: `classes/${type}/check.mjs`, digest: "d".repeat(64) }],
    verification: [{ id: "behaviour", root: "package", argv: ["node", `classes/${type}/check.mjs`], cwd: ".", prepare: [], tools: { node: "26" }, fixtures: [`classes/${type}/check.mjs`], locks: [], network: false, timeoutSeconds: 30, expectedExit: 0, scope: "required-local", requirements: [] }],
  };
  const reference = { name: descriptor.name, version: descriptor.version, digest: descriptorDigest(descriptor) };
  return { licence: "Apache-2.0", platforms: ["web", "server", "ios", "macos", "android"], classes: [{ reference, descriptor }], implements: [reference], upstream: [], compatibility: { runtimes: {}, frameworks: {}, dependencies: [], styles: { scope: "none", namespaces: [], conflicts: [] } }, maintenance: { owners: ["Example Maintainer"], contact: "mailto:maintainer@example.org", repository: "https://example.org/component", updates: { source: "https://example.org/component/releases", strategy: "manual" } }, files: [...descriptor.inventory.map(v => ({ path: v.path, executable: false })), { path: "src/index.mjs", executable: false }], artefacts: [{ source: "src/index.mjs", destination: `components/${slug}/index.mjs`, template: false, executable: false }] };
}

export function exampleRecipeFoundations(): Foundations {
  const parts = ["card-deck", "seating", "server-host", "apple-host", "guided-tour"].map(s => exampleFoundations(s));
  return { ...parts[0], classes: parts.flatMap(f => f.classes), implements: [], files: parts.flatMap(f => f.files.filter(v => v.path !== "src/index.mjs")), artefacts: [] };
}
const reference = (slug: string) => exampleFoundations(slug).classes[0].reference;

// The publish bodies of the example classes: { format: 2, class }.
export function exampleClassEntries(): (Omit<ClassEntry, "digest"> & { digest?: string })[] {
  return exampleRecipeFoundations().classes.map((c) => ({ format: 2, class: c.descriptor }));
}

export function exampleRecipeEntry(): RecipeEntry {
  return {
    foundations: exampleRecipeFoundations(),
    format: 2,
    release: { channel: "features", fixes: [] },
    images: [exampleImage()],
    vulnerabilityWaivers: [],
    quality: null,
    recipe: {
      format: 2,
      name: "acme/poker-night",
      version: "0.1.0",
      title: "Poker Night",
      summary: "A card game for a club's league night, with house rules.",
      category: "games",
      tags: ["cards", "multiplayer"],
      targets: { client: ["web", "ios", "android", "macos"], server: ["hosting-provider"] },
      components: [
        { id: "deck", class: reference("card-deck"), preferred: { name: "acme/card-deck", version: "0.1.0" }, configuration: {}, includedWhen: null },
        { id: "seats", class: reference("seating"), preferred: { name: "acme/seating", version: "0.1.0" }, configuration: { minimumPlayers: 2 }, includedWhen: null },
        {
          id: "host",
          class: reference("server-host"),
          preferred: { name: "acme/server-host", version: "0.1.0" },
          configuration: {},
          includedWhen: null,
        },
        { id: "apple", class: reference("apple-host"), preferred: { name: "acme/apple-host", version: "0.1.0" }, configuration: {}, includedWhen: "'ios' in targets || 'macos' in targets" },
        { id: "tour", class: reference("guided-tour"), preferred: { name: "acme/guided-tour", version: "0.1.0" }, configuration: {}, includedWhen: "lessons" },
      ],
      jobs: [{ id: "server", slot: "host", overrideQuestion: "server", candidates: [{ component: "acme/server-host", profile: "free" }, { component: "acme/server-host", profile: "paid" }] }],
      scale: { question: "scale", bands: [{ id: "small", label: "fewer than 10 people, occasional use", load: { concurrentPeople: 10, requestsPerDay: 2000 } }, { id: "medium", label: "up to 100 people, daily use", load: { concurrentPeople: 100, requestsPerDay: 50000 } }] },
      questions: [
        { id: "targets", ask: "unless-settled", question: "Which devices should the game run on?", type: "set", options: ["web", "ios", "android", "macos"], default: ["web", "ios", "android"], effects: [{ sets: { "host.targets": "$answer" } }] },
        { id: "scale", ask: "unless-settled", question: "How many people, and how often?", type: "choice", options: ["small", "medium"], default: "small", effects: [{ sets: { "host.expectedPeople": { fromScale: "concurrentPeople" } } }] },
        { id: "chips", ask: "default", question: "Starting chips?", type: "integer", default: 5000, min: 100, max: 1000000, effects: [{ sets: { "application.startingChips": "$answer" } }] },
        { id: "lessons", ask: "default", question: "Lessons for new players?", type: "boolean", default: true, effects: [] },
        { id: "tourStyle", ask: "default", question: "Short or full lessons?", type: "choice", options: ["short", "full"], default: "short", askWhen: "lessons", effects: [{ sets: { "tour.length": { map: { short: "brief", full: "complete" } } } }] },
        { id: "server", ask: "required", question: "Which hosting plan?", type: "choice", options: ["free", "paid"], effects: [] },
        { id: "serverKey", ask: "required", question: "Reference to the hosting access key", type: "secretRef", default: null, askWhen: "server == 'paid'", effects: [{ sets: { "host.accountReference": { ref: "serverKey" } } }] },
      ],
      connections: [
        { source: { instance: "deck", port: "card-deck" }, target: { instance: "seats", port: "card-deck" } },
        { source: { instance: "seats", port: "seating" }, target: { instance: "application", port: "seating" } },
        { source: { instance: "host", port: "server-host" }, target: { instance: "application", port: "server-host" } },
        { source: { instance: "apple", port: "apple-shell" }, target: { instance: "application", port: "apple-shell" } },
        { source: { instance: "tour", port: "guided-tour" }, target: { instance: "application", port: "guided-tour" } },
      ],
      tests: { defaultAnswers: {}, answerSets: [{ id: "web-only", answers: { targets: ["web"] } }] },
      page: { description: "page/description.md", diagram: "page/diagram.svg", screenshots: [] },
      instructions: "INSTRUCTIONS.md",
    },
    digest: EXAMPLE_DIGEST,
    source: { repository: "acme/poker-night-recipe", tag: "v0.1.0" },
    bundle: { asset: "poker-night-0.1.0.tar", digest: EXAMPLE_BUNDLE_DIGEST },
    page: {
      description: "Poker Night deals a hand for every member at the table.\n\nChoose your devices, your starting chips and whether new players get lessons.",
      diagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect x="2" y="2" width="50" height="36" rx="6" fill="#ddd"/><text x="10" y="25">deck</text><rect x="68" y="2" width="50" height="36" rx="6" fill="#ddd"/><text x="76" y="25">seats</text></svg>',
    },
  };
}

const LIBRARY: Suitability = { format: 1, jobs: ["library"], profiles: [{ id: "any", load: {}, cost: "none", regions: ["any"], compliance: [], provider: null, notes: "" }], notes: "" };

const DEFAULTS: Record<string, SettingValue> = { integer: 2, boolean: false, slug: "standard", label: "Standard", identifier: "standard", qualified: "com.example", environment: "STANDARD", address: "https://example.com" };

const setting = (id: string, type: SettingDeclaration["type"], grammar: string, more: Partial<SettingDeclaration> = {}): SettingDeclaration => {
  const s: SettingDeclaration = { id, type, grammar, required: false, secret: false, hasDefault: true, ...more };
  return s.hasDefault ? { default: DEFAULTS[type === "string" ? grammar : type], ...s } : s;
};

const described = (ports: Port[]): EntryPort[] => ports.map((p) => ({ ...p, description: `The ${p.type} interface: what a ${p.id.replace(/-/g, " ")} offers the application.` }));

function component(slug: string, description: string, provides: Port[], requires: Port[], settings: SettingDeclaration[], suitability: Suitability = LIBRARY): ComponentEntry {
  const foundations = exampleFoundations(slug);
  return {
    foundations,
    format: 3,
    release: { channel: "features", fixes: [] },
    images: foundations.classes[0]!.descriptor.presentation === "visual" ? [exampleImage()] : [],
    vulnerabilityWaivers: [],
    quality: null,
    name: `acme/${slug}`,
    version: "0.1.0",
    digest: EXAMPLE_DIGEST,
    description,
    page: { description: `${description}\n\n## Examples\n\nA club night uses it at every table.\n\n## Settings\n\nEach setting has a default that suits a club night.\n\n## How it is checked\n\n\`node --test tests/web.test.ts\` checks it.` },
    tags: [],
    targets: { client: ["web"], server: [] },
    guardians: [],
    provides: described(provides),
    requires: described(requires),
    settings,
    interfaceDigests: Object.fromEntries(provides.map((p) => [interfaceKey(p), EXAMPLE_INTERFACE_DIGEST])),
    interfaceModules: {},
    dependencies: [],
    suitability,
    migration: null,
    source: { repository: `acme/${slug}`, tag: "v0.1.0" },
    bundle: { asset: `${slug}-0.1.0.tar`, digest: EXAMPLE_BUNDLE_DIGEST },
  };
}

export function exampleComponentEntry(): ComponentEntry {
  return {
    ...component("card-deck", "A shuffled deck of 52 cards that deals and burns cards.", [{ id: "card-deck", type: "ae/card-deck", version: "1.0.0" }], [{ id: "random-source", type: "ae/random-source", version: "1.0.0", optional: true }], [], { ...LIBRARY, jobs: ["card-deck"] }),
    tags: ["cards", "deck"],
    guardians: ["Example Guardian Ltd"],
    interfaceModules: { "ae/card-deck@1.0.0": { web: { path: "web/index.ts", installed: true }, apple: { path: "apple/Sources", installed: true } } },
  };
}

// The components the example recipe prefers, one per slot, each fitting its slot's class.
export function exampleComponentEntries(): ComponentEntry[] {
  const hosting: Suitability = {
    format: 1,
    jobs: ["server-host"],
    profiles: [
      { id: "free", load: { concurrentPeople: 10, requestsPerDay: 100000 }, cost: "free", regions: ["any"], compliance: [], provider: { name: "Example Hosting", tier: "free", limitsSource: null }, notes: "" },
      { id: "paid", load: {}, cost: "paid", regions: ["any"], compliance: [], provider: { name: "Example Hosting", tier: "paid", limitsSource: null }, notes: "" },
    ],
    notes: "",
  };
  return [
    exampleComponentEntry(),
    component("seating", "Seats for the people at a table.", [{ id: "seating", type: "ae/seating", version: "1.0.0" }], [{ id: "card-deck", type: "ae/card-deck", version: "1.0.0" }], [setting("minimumPlayers", "integer", "integer")], LIBRARY),
    component(
      "server-host",
      "Runs the game's server on a hosting provider.",
      [{ id: "server-host", type: "ae/server-host", version: "1.0.0" }],
      [],
      [setting("targets", "string", "label", { required: true, hasDefault: false }), setting("expectedPeople", "integer", "integer"), setting("accountReference", "string", "slug", { secret: true, hasDefault: false })],
      hosting,
    ),
    component("apple-host", "The iPhone, iPad and Mac shell.", [{ id: "apple-shell", type: "ae/apple-shell", version: "1.0.0" }], [], [], LIBRARY),
    component("guided-tour", "Lessons that walk a new player through a hand.", [{ id: "guided-tour", type: "ae/guided-tour", version: "1.0.0" }], [], [setting("length", "string", "slug")], LIBRARY),
  ];
}

// Another component of the class of the example recipe's seats slot.
export function exampleAlternativeEntry(): ComponentEntry {
  return component("club-seating", "Seats assigned by club membership number.", [{ id: "seating", type: "ae/seating", version: "1.0.0" }], [{ id: "card-deck", type: "ae/card-deck", version: "1.0.0" }], [setting("minimumPlayers", "integer", "integer"), setting("membership", "string", "slug")], LIBRARY);
}

// The example components as a recipe check's component source.
export function exampleRecipeContext(entries: ComponentEntry[] = exampleComponentEntries()): RecipeContext {
  const find = (name: string, version: string) => {
    const entry = entries.find((e) => e.name === name && e.version === version);
    return entry ? componentFacts(entry) : null;
  };
  return { authority: exampleRecipeFoundations(), components: { source: "the example catalogue", find } };
}
