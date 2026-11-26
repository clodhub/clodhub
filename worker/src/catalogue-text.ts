// Plain-text pages of the recipe library and component catalogue, for agents that read without a browser.
import { ASK_HEADINGS, shortForm, buildingItSection, groupHasMore, recipeBuildSteps, PACKAGE_CHECK, PACKAGE_WHERE, QUALITY_TEXT, SIGNATURES_NOTE, classSettings, deprecationLine, describeCondition, kindText, markdownSections, questionGroups, recipeUseSentence } from "@clodhub/shared";
import type { CategoryCount, ClassList, ClassVersionView, ClassInterface, ComponentList, ComponentSummary, ComponentVersionView, Condition, Deprecation, FoundationSummary, EntryPort, Foundations, ListQuery, PackageContents, PackageDetails, Port, Quality, RecipeList, RecipeQuestion, RecipeSlotView, RecipeSummary, RecipeVersionView, SettingDeclaration, SlotDetails, Suitability, Targets } from "@clodhub/shared";

const COPYRIGHT = "Copyright Level N Ltd 2026";

const list = (items: readonly unknown[]): string => (items.length === 0 ? "none" : items.join(", "));
const targets = (t: Targets): string => `client ${list(t.client)}; server ${list(t.server)}`;
const ports = (p: Port[]): string => list(p.map((x) => `${x.id} (${x.type} ${x.version}${x.optional ? ", optional" : ""})`));
const interfaces = (p: ClassInterface[]): string => list(p.map((x) => `${x.type} ${x.version}${x.optional ? " (optional)" : ""}`));

const warnings = (deprecations: Deprecation[]): string[] => deprecations.map((d) => `DEPRECATION WARNING: ${deprecationLine(d)}`);
// What the archive holds, by kind of file, and where installing puts the files that go into the application.
const packageLines = (v: { bundle: { asset: string }; source: { repository: string; tag: string }; contents: PackageContents }, notIncluded: string): string[] => {
  const c = v.contents;
  return [
    "",
    "What you download",
    `${v.bundle.asset}, from release ${v.source.tag} of ${v.source.repository}: ${c.files} files`,
    ...c.groups.map((g) => `- ${g.label} (${g.count}): ${g.examples.join(", ")}${groupHasMore(g) ? ", ..." : ""}`),
    `Installing copies ${c.installed.count} of them into the application${c.installed.root ? ` under ${c.installed.root}` : ""}: ${list(c.installed.folders.map((f) => `${f.folder} ${f.count}`))}`,
    `Not included: ${notIncluded}`,
    `${PACKAGE_WHERE} ${PACKAGE_CHECK}`,
  ];
};
// A described interface: its id, type and version, then what its document says it is.
const portLines = (p: EntryPort[], also: (p: EntryPort) => string): string[] => (p.length === 0 ? ["- none"] : p.flatMap((x) => [`- ${x.id} (${x.type} ${x.version}${x.optional ? ", optional" : ""})${x.description ? `: ${x.description}` : ""}`, `  ${also(x)}`]));
// The steps an agent runs to build an application from this recipe with clod, then the recipe's own "Building it".
const buildSteps = (v: RecipeVersionView, origin: string): string[] => {
  const own = buildingItSection(v.description);
  const steps = recipeBuildSteps(v);
  return [
    "",
    "Build it (clod, Python 3.12, Node.js, Graphviz)",
    ...steps.flatMap((s, i) => (s.command ? [`${i + 1}. ${s.command}`, `   ${s.text}`] : [`${i + 1}. ${s.text}`])),
    ...(own ? ["", "From the recipe (its description, \"Building it\")", own.text, ...(own.cut ? [`The rest: ${detailsAddress(v, origin)}`] : [])] : []),
  ];
};
// One line per build report.
const reportLines = (v: RecipeVersionView): string[] =>
  v.buildReports.length === 0
    ? []
    : [
        "",
        `Build reports (${v.buildReports.length}): agents building an application from this recipe, newest first`,
        ...v.buildReports.map(
          (r) =>
            `- ${r.version}${r.current ? "" : " (not the current version)"}, ${r.date}: ${r.agent.harness}, ${r.agent.model}; ${r.activeMinutes} active minutes, US$${r.costUsd.toFixed(2)}; built ${r.results.filter((x) => x.built).length} of ${r.results.length} targets; ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}; rated ${r.rating.score}/${r.rating.of}; ${r.url}`,
        ),
      ];
const publisherLine = (p: { displayName: string; slug: string } | null): string => (p ? `Publisher: ${p.displayName} (${p.slug})` : "Publisher: none (the publisher deleted their account)");

function page(title: string, body: string[]): string {
  return `${[title, "", ...body, "", COPYRIGHT].join("\n")}\n`;
}

const quality = (q: Quality | null): string => (q ? `${QUALITY_TEXT[q.level]}${q.certified ? ", certified" : ", publisher-reviewed"}` : "not assessed");
const known = (n: number | null, checkedAt: string | null = null): string => (n === null ? (checkedAt ? "unknown: OSV could not check one of its package URLs" : "not checked yet") : n === 0 ? "none known" : `${n} known`);

function recipeLine(r: RecipeSummary): string[] {
  return [`- ${r.title} (${r.name}) ${r.version}: ${r.summary}`, ...warnings(r.deprecations).map((w) => `  ${w}`), `  category ${r.category}; platforms ${list(r.platforms)}; quality ${quality(r.quality)}; ${r.channel}; vulnerabilities ${known(r.vulnerabilities)}; ${r.downloads} downloads in 30 days; updated ${r.updatedAt.slice(0, 10)}`, `  ${r.url}.txt`];
}

function componentLine(c: ComponentSummary): string[] {
  return [`- ${c.name} ${c.version}: ${c.description}`, ...warnings(c.deprecations).map((w) => `  ${w}`), `  class ${c.class.name}@${c.class.version} (${c.class.title}); category ${c.category}; platforms ${list(c.platforms)}; licence ${c.licence}`, `  quality ${quality(c.quality)}; ${c.channel}; vulnerabilities ${known(c.vulnerabilities)}; ${c.downloads} downloads in 30 days; updated ${c.updatedAt.slice(0, 10)}`, `  ${c.url}.txt`];
}

function counts(categories: CategoryCount[], kind: "recipes" | "components"): string {
  return list(categories.map((c) => `${c.id} (${c[kind]})`));
}

// The query string of a listing with one value changed; empty values are left out.
function listUrl(origin: string, path: string, q: ListQuery, change: Partial<Record<keyof ListQuery, string | null>>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...q, ...change })) {
    if (v === undefined || v === null || k === "limit" || (k === "deprecated" && v === "include")) continue;
    for (const one of Array.isArray(v) ? v : [v]) params.append(k, String(one));
  }
  const s = params.toString();
  return `${origin}${path}${s ? `?${s}` : ""}`;
}

const totalText = (t: { count: number; approximate: boolean }): string => (t.approximate ? `more than ${t.count.toLocaleString("en-GB")}` : t.count.toLocaleString("en-GB"));

const LIST_HELP = "Parameters: q (search; a word of 3 or more characters also matches word starts, a shorter one whole words only. Results follow the sort over every match: with at most 1,000 matches all are ordered at once; with more, a page may come back short after checking 20,000 entries, and Next continues. Relevance with more than 1,000 matches ranks the 1,000 most downloaded), category, platform, licence, quality (packaged|reviewed|integration-tested|live-tested, that level or above), certified=true|false, channel (security|features|preview), secure=true (no known vulnerabilities), publisher, deprecated=exclude|include|only, sort (relevance with q, downloads, trending, updated, name), cursor (from Next or Previous), limit (1 to 100, default 30).";

function pageLinks(origin: string, path: string, l: { query: ListQuery; next: string | null; previous: string | null }): string[] {
  return [...(l.previous ? [`Previous: ${listUrl(origin, path, l.query, { cursor: l.previous })}`] : []), ...(l.next ? [`Next: ${listUrl(origin, path, l.query, { cursor: l.next })}`] : [])];
}

export function recipeListText(l: RecipeList, origin: string): string {
  return page("ClodHub recipes", [
    `${totalText(l.total)} recipes match; this page shows ${l.recipes.length}, sorted by ${l.query.sort}.`,
    `Categories here: ${counts(l.categories, "recipes")}`,
    LIST_HELP,
    `JSON: ${listUrl(origin, "/api/recipes", l.query, {})}. Components: ${origin}/components.txt. Classes: ${origin}/classes.txt`,
    "",
    ...(l.recipes.length === 0 ? ["No recipes match."] : l.recipes.flatMap(recipeLine)),
    "",
    ...pageLinks(origin, "/recipes.txt", l),
  ]);
}

export function componentListText(l: ComponentList, origin: string): string {
  return page("ClodHub components", [
    `${totalText(l.total)} components match; this page shows ${l.components.length}, sorted by ${l.query.sort}.`,
    `Categories here: ${counts(l.categories, "components")}`,
    `${LIST_HELP} Components also take class (a class package name such as pkg:clod/com.clodhub/card-deck-class, percent-encoded), provides and requires (interface types such as com.clodhub/card-deck) (each may repeat; a component matches every one).`,
    `JSON: ${listUrl(origin, "/api/components", l.query, {})}. Recipes: ${origin}/recipes.txt. Classes: ${origin}/classes.txt`,
    "",
    ...(l.components.length === 0 ? ["No components match."] : l.components.flatMap(componentLine)),
    "",
    ...pageLinks(origin, "/components.txt", l),
  ]);
}

export function classListText(l: ClassList, origin: string): string {
  return page("ClodHub component classes", [
    `${totalText(l.total)} classes; this page shows ${l.classes.length}, by category. Filter with ?category=. JSON: ${origin}/api/classes. Category tree: ${origin}/categories.txt`,
    `Categories here: ${list(l.categories.map((c) => `${c.id} (${c.classes})`))}`,
    "",
    ...(l.classes.length === 0 ? ["No classes match."] : l.classes.flatMap((c) => [`- ${c.title} (${c.name}) ${c.version}: ${c.summary}`, `  category ${c.category}; ${c.presentation === "visual" ? "visual" : "no visual output"}; ${c.implementations} implementations`, `  ${c.url}.txt`])),
    ...(l.next ? ["", `Next: ${origin}/classes.txt?cursor=${l.next}`] : []),
  ]);
}

export function classText(c: ClassVersionView, origin: string): string {
  const settings = classSettings(c.settings).map((p) => `${p.id} ${p.kind ? kindText(p.kind) : "unknown"}${p.required ? ", always written" : ""}`);
  return page(`${c.title} (${c.name}) ${c.version}`, [
    c.summary,
    "",
    `Package URL: ${c.name}@${c.version}`,
    `Category: ${c.category}; ${c.presentation === "visual" ? "implementations render something people see (each shows images)" : "no visual output"}`,
    `Digest: sha256:${c.digest}`,
    `Provides: ${list(c.provides.map((p) => `${p.type} ${p.version} (entry modules ${list(Object.entries(p.modules).map(([k, v]) => `${k} ${v.join(" ")}`))})`))}`,
    `Requires: ${interfaces(c.requires)}`,
    `Settings: ${list(settings)}`,
    `Shared checks: ${list(c.suites.map((s) => `${s.id} (${s.argv.join(" ")}; ${s.timeoutSeconds} s${s.network ? "; network" : ""})`))}`,
    "",
    `Implementations (${c.implementations}; the ${c.implementationList.length} most downloaded of this version)`,
    ...(c.implementationList.length === 0 ? ["none listed"] : c.implementationList.map((i) => `- ${i.name} ${i.version}: ${i.description}; quality ${quality(i.quality)}; platforms ${list(i.platforms)}; ${i.downloads} downloads; vulnerabilities ${known(i.vulnerabilities)}; ${i.url}.txt`)),
    `All implementations: ${origin}/components.txt?class=${encodeURIComponent(c.name)}`,
    "",
    "Versions",
    ...c.versions.map((v) => `- ${v.version} (${v.publishedAt}) sha256:${v.digest}`),
    "",
    `Page: ${origin}/classes/${c.slug}; JSON: ${origin}/api/classes/${c.slug}/${c.version}`,
  ]);
}

export function categoriesText(t: { categories: CategoryCount[] }, origin: string): string {
  const depth = (id: string) => id.split("/").length - 1;
  return page("ClodHub categories", [
    `The category tree with the classes, components and recipes listed in each (a category counts its descendants). JSON: ${origin}/api/categories`,
    "",
    ...t.categories.map((c) => `${"  ".repeat(depth(c.id))}- ${c.title} (${c.id}): ${c.classes} classes, ${c.components} components, ${c.recipes} recipes`),
  ]);
}

function answer(value: unknown): string {
  return value === undefined || value === null ? "asked" : typeof value === "string" ? value : JSON.stringify(value);
}

// A condition in words, or the CEL expression itself in backticks when it has no plain wording.
const when = (c: Condition): string => describeCondition(c) ?? `\`${c}\``;

function setValue(v: unknown): string {
  if (typeof v === "string") return v === "$answer" ? "the answer" : JSON.stringify(v);
  return JSON.stringify(v);
}

function question(q: RecipeQuestion): string[] {
  const out = [`- ${q.id} (${q.type}): ${q.question}`];
  if (q.askWhen) out.push(`  follow-up: asked when ${when(q.askWhen)}`);
  if (q.options) out.push(`  options: ${q.options.join(", ")}`);
  if (q.min !== undefined || q.max !== undefined) out.push(`  range: ${q.min ?? "any"} to ${q.max ?? "any"}`);
  if (q.ask !== "required") out.push(`  default: ${answer(q.default)}`);
  if (q.askAgent) out.push(`  agent: ${q.askAgent}`);
  for (const effect of q.effects) for (const [target, value] of Object.entries(effect.sets)) out.push(`  sets ${target} to ${setValue(value)}`);
  return out;
}

function jobLines(v: RecipeVersionView): string[] {
  if (v.jobs.length === 0 && !v.scale) return [];
  return [
    "Choosing by suitability",
    ...(v.scale ? [`Scale question: ${v.scale.question}`, ...v.scale.bands.map((b) => `- band ${b.id}: ${b.label}; load ${list(Object.entries(b.load).map(([k, n]) => `${k} ${n}`))}`)] : []),
    ...v.jobs.flatMap((j) => [`- job ${j.id} fills slot ${j.slot}${j.overrideQuestion ? ` (the answer to ${j.overrideQuestion} restricts the candidates first)` : ""}: ${j.candidates.map((c) => `${c.component}${c.version ? ` ${c.version}` : ""} (${c.profile})${c.includedWhen ? ` only when ${when(c.includedWhen)}` : ""}`).join(", ")}`]),
    "",
  ];
}

function connectionLines(v: RecipeVersionView): string[] {
  return ["Connections (application is the recipe's own component)", ...(v.connections.length === 0 ? ["none"] : v.connections.map((c) => `- ${c.source.instance}.${c.source.port} -> ${c.target.instance}.${c.target.port}`)), ""];
}

function suitabilityLines(s: Suitability): string[] {
  return s.profiles.map((p) => {
    const load = Object.entries(p.load).map(([k, v]) => `${k} ${v}`);
    const settings = Object.entries(p.settings ?? {}).map(([k, v]) => `${k} ${JSON.stringify(v)}`);
    return `    profile ${p.id}: cost ${p.cost}; load ${list(load)}; regions ${list(p.regions)}; compliance ${list(p.compliance)}${p.provider ? `; ${p.provider.name} ${p.provider.tier}` : ""}${settings.length > 0 ? `; settings ${list(settings)}` : ""}`;
  });
}

// One slot: its class (interfaces and the settings the recipe writes), its preferred component, and the others of its class.
function slotLines(s: RecipeSlotView, more: SlotDetails, recipe: string): string[] {
  const only = s.includedWhen ? ` (only when ${when(s.includedWhen)})` : "";
  const settings = classSettings(more.declaration.settings).map((p) => `${p.id} ${p.kind ? kindText(p.kind) : "unknown"}${p.required ? ", always written" : ""}`);
  const out = [
    `- slot ${s.id}${only}`,
    `    class: ${s.class.name} ${s.class.version} ${s.class.digest}; provides ${interfaces(more.declaration.provides)}; requires ${interfaces(more.declaration.requires)}; settings ${list(settings)}`,
    `    preferred: ${s.preferred.name} ${s.preferred.version}${s.preferred.url ? ` (${s.preferred.url}.txt)` : ", not listed in the catalogue"}`,
  ];
  if (s.deprecation) out.push(`    DEPRECATION WARNING: ${deprecationLine(s.deprecation)}`);
  if (s.catalogue) out.push(`    guardians: ${list(s.catalogue.guardians)}`);
  if (more.suitability) out.push(`    suitable for jobs: ${list(more.suitability.jobs)}`, ...suitabilityLines(more.suitability));
  out.push(`    other components of this class (${s.alternatives.count}): ${s.alternatives.url}`, `    clod alternatives ${recipe} ${s.id} --store store`);
  return out;
}

function settingLine(s: SettingDeclaration): string {
  const traits = [s.required ? "required" : "optional", s.hasDefault ? `default ${JSON.stringify(s.default)}` : "no default", ...(s.secret ? ["a secret reference"] : [])];
  return `- ${s.id}: ${kindText(s)}; ${traits.join(", ")}`;
}

function versions(v: { versions: { version: string; publishedAt: string; digest: string; channel: string; fixes: string[] }[] }): string[] {
  return v.versions.map((x) => `- ${x.version} ${x.channel}${x.fixes.length ? ` (fixes ${x.fixes.join(", ")})` : ""} (${x.publishedAt}) ${x.digest}`);
}

// Channel, fixes, the line and its security releases, quality, vulnerabilities and images.
function releaseLines(v: RecipeVersionView | ComponentVersionView, kind: "recipes" | "components", origin: string): string[] {
  const s = v.vulnerabilitySummary;
  return [
    `Release: ${v.release.channel}${v.release.fixes.length ? `, fixes ${v.release.fixes.join(", ")}` : ""}`,
    `Line ${v.line.line}: ${v.line.securityReleases.length === 0 ? "no security releases" : `security releases ${v.line.securityReleases.map((r) => `${r.version} (fixes ${r.fixes.join(", ")})`).join("; ")}`}`,
    `Quality: ${quality(v.quality)}${v.quality?.liveTested ? `; live-tested ${v.quality.liveTested.at} on ${v.quality.liveTested.platform}` : ""}`,
    `Known vulnerabilities: ${known(s.count, s.checkedAt)}${s.checkedAt ? ` (checked ${s.checkedAt.slice(0, 10)} at OSV)` : ""}${v.vulnerabilityWaivers.length ? `; waived ${v.vulnerabilityWaivers.map((w) => w.id).join(", ")}` : ""}; ${s.url}`,
    `Downloads: ${v.downloads} in 30 days; ${v.versionDownloads} of this version`,
    ...(v.images.length ? [`Images (${v.images.length}): ${v.images.map((i) => `${i.url} (${i.platform}, ${i.caption})`).join("; ")}`] : []),
    `Classes: ${origin}/classes.txt; this ${kind === "recipes" ? "recipe" : "component"} as JSON: ${origin}/api/${kind}/${v.slug}/${v.version}`,
  ];
}

function foundationLines(f: Foundations): string[] {
  return ["", "Package foundations (publisher-declared)", `Signatures: ${SIGNATURES_NOTE}`, `Wrapper licence: ${f.licence}`, `Platforms: ${f.platforms.join(", ")}`, `Runtime requirements: ${JSON.stringify(f.compatibility.runtimes)}`, `Framework requirements: ${JSON.stringify(f.compatibility.frameworks)}`, `Exact dependencies: ${JSON.stringify(f.compatibility.dependencies)}`, `Styles: ${JSON.stringify(f.compatibility.styles)}`, `Maintainers: ${f.maintenance.owners.join(", ")}; ${f.maintenance.contact}`, `Maintenance repository: ${f.maintenance.repository}`, `Updates: ${f.maintenance.updates.source} (${f.maintenance.updates.strategy})`, ...f.upstream.map(u => `Upstream: ${u.name} ${u.version}; revision ${u.revision ?? "not supplied"}; ${u.repository}; ${u.purl}; licence ${u.licence}; notices ${u.notices.join(", ")}; delivery ${JSON.stringify(u.delivery)}`), ...f.classes.flatMap(c => [`Class: ${c.reference.name} ${c.reference.version} ${c.reference.digest}`, `Shared behaviour suites: ${c.descriptor.verification.map(s => s.id).join(", ")}`, `Class modules: ${JSON.stringify(c.descriptor.provides.map(p => ({ type: p.type, modules: p.modules })))}`, `Class interface and test inventory: ${JSON.stringify(c.descriptor.inventory)}`])];
}

// One slot: what its class is, its preferred component and what that does, and when it is included.
function slotLine(s: RecipeSlotView): string[] {
  const only = s.includedWhen ? `; only when ${when(s.includedWhen)}` : "";
  return [
    `- ${s.id}: ${s.classInfo.title}, ${s.classInfo.summary.charAt(0).toLowerCase()}${s.classInfo.summary.slice(1)} (class ${s.class.name}@${s.class.version}, ${s.classInfo.url}.txt)${only}`,
    `  preferred ${s.preferred.name}@${s.preferred.version}${s.catalogue ? `: ${s.catalogue.description}` : ", not listed in the catalogue"}`,
    ...(s.deprecation ? [`  DEPRECATION WARNING: ${deprecationLine(s.deprecation)}`] : []),
  ];
}

// Every component the recipe names, preferred or job candidate, once.
function componentLines(v: RecipeVersionView): string[] {
  const urls = new Map<string, string | null>();
  for (const s of v.components) urls.set(`${s.preferred.name}@${s.preferred.version}`, s.preferred.url);
  for (const j of v.jobs) for (const c of j.candidates) if (c.version && !urls.has(`${c.component}@${c.version}`)) urls.set(`${c.component}@${c.version}`, null);
  return [...urls.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, url]) => `- ${id}${url ? ` ${url}.txt` : ""}`);
}

const detailsAddress = (v: RecipeVersionView, origin: string): string => `${origin}/recipes/${v.slug}/details.txt?version=${v.version}`;

// The recipe page an agent reads first: what it is, how to build it, the questions, the slots and the components.
// The bulky parts are on the details page (recipeDetailsText).
export function recipeText(v: RecipeVersionView, origin: string): string {
  const components = componentLines(v);
  return page(`${v.title} (${v.name}) ${v.version}`, [
    ...(v.deprecations.length > 0 ? [...warnings(v.deprecations), `Deprecation tree: ${origin}/api/recipes/${v.slug}/${v.version}/deprecations`, ""] : []),
    v.summary,
    "",
    `Package URL: ${v.name}@${v.version}`,
    `Targets: ${targets(v.targets)}`,
    `Category: ${v.category}; tags ${list(v.tags)}`,
    publisherLine(v.publisher),
    `Source: ${v.source.repository} release ${v.source.tag}; digest ${v.digest}`,
    ...releaseLines(v, "recipes", origin),
    `Bundle download: GET ${v.bundle.url} returns a link valid for one hour${v.status === "orphaned" ? "; with no publisher the link exists only while the release is public, otherwise the status is bundle-unavailable" : ""}`,
    ...buildSteps(v, origin),
    ...reportLines(v),
    "",
    `Questions (${v.questions.length})`,
    ...questionGroups(v.questions).flatMap((g) => ["", `${g.heading} (${g.questions.length})`, ...g.questions.flatMap(question)]),
    "",
    `Slots (${v.components.length}): each needs a component of its class; the preferred component fills it unless another component that fits the class is substituted (clod alternatives ${shortForm(v.name, v.version)} SLOT --store store)`,
    ...v.components.flatMap(slotLine),
    "",
    ...jobLines(v),
    `Tested answer sets: default${v.tests.answerSets.length > 0 ? `, ${v.tests.answerSets.map((s) => s.id).join(", ")}` : ""}`,
    "",
    `Components (${components.length})`,
    ...components,
    "",
    "Links",
    `Details (description, slot classes and suitability, connections, tested answers, package foundations and upstream sources, versions): ${detailsAddress(v, origin)}`,
    `Page: ${origin}/recipes/${v.slug}; JSON: ${origin}/api/recipes/${v.slug}/${v.version}`,
    ...(v.diagram ? [`Diagram: ${origin}/api/recipes/${v.slug}/${v.version}/diagram.svg`] : []),
    `Components diagram: ${origin}/api/recipes/${v.slug}/${v.version}/components.svg`,
  ]);
}

// The rest of a recipe: what the summary page leaves out.
export function recipeDetailsText(v: RecipeVersionView, slots: SlotDetails[], details: PackageDetails, origin: string): string {
  return page(`${v.title} (${v.name}) ${v.version}: details`, [
    `The recipe page, with the build steps, questions, slots and components: ${origin}/recipes/${v.slug}.txt?version=${v.version}`,
    `Digest: ${v.digest}`,
    `Bundle: ${v.bundle.asset} ${v.bundle.digest}`,
    ...packageLines(v, `the ${v.components.length} components of its slots; each is a separate download, fetched by exact version and checked against its digest`),
    "",
    "Description",
    v.description,
    "",
    `Slot details (${v.components.length})`,
    ...v.components.flatMap((s, i) => slotLines(s, slots[i]!, shortForm(v.name, v.version))),
    "",
    ...connectionLines(v),
    `Tested answer sets: default${v.tests.answerSets.length > 0 ? `, ${v.tests.answerSets.map((s) => s.id).join(", ")}` : ""}`,
    ...v.tests.answerSets.map((s) => `- ${s.id}: ${JSON.stringify(s.answers)}`),
    "",
    "Versions",
    ...versions(v),
    ...foundationLines(details.foundations),
  ]);
}

const requirementLines = (f: FoundationSummary): string[] => [
  `Platforms: ${list(f.platforms)}`,
  `Toolchains: ${list(Object.entries(f.runtimes).map(([k, r]) => `${k} ${r}`))}`,
  `Frameworks: ${list(Object.entries(f.frameworks).map(([k, x]) => `${k}: ${x.name} ${x.range}`))}`,
  `Styles: scope ${f.styles.scope}; ${f.styles.namespaces} namespaces; ${f.styles.conflicts} conflicts`,
  `Licence: ${f.licence}; ${f.counts.upstream} upstream sources, ${f.counts.dependencies} exact dependencies, ${f.counts.files} files (listed on the details page)`,
];

// The classes the component implements, with the entry modules each provided interface declares per platform.
function classLines(f: FoundationSummary): string[] {
  return f.implements.flatMap((c) => [
    `Implements: ${c.reference.name}@${c.reference.version} ${c.reference.digest}`,
    ...c.provides.map((p) => `  ${p.type} ${p.version} entry modules: ${list(Object.entries(p.modules).map(([platform, m]) => `${platform} ${m.join(" ")}`))}`),
    `  shared behaviour suites: ${list(c.suites)}`,
  ]);
}

// The recipe.json slot that names this component, and the clod commands that use it in another slot of its class.
function recipeUseLines(v: ComponentVersionView): string[] {
  const c = v.foundations.implements[0]?.reference;
  if (!c) return ["How to use in a recipe: this component implements no class, so no slot can name it"];
  const slot = { id: v.slug, class: { name: c.name, version: c.version, digest: c.digest }, preferred: { name: v.name, version: v.version } };
  return [
    "How to use in a recipe",
    recipeUseSentence(v),
    `- as a slot in recipe.json components: ${JSON.stringify(slot)}`,
    `- in place of another component of the class: clod fetch ${shortForm(v.name, v.version)} --store store --from https://clodhub.com, then clod design RECIPE@VERSION --store store --answers answers.json --substitute SLOT=${shortForm(v.name, v.version)} --out definition.json`,
  ];
}

// The component page an agent reads first: what it is, its class, what it provides and needs, its settings and how a
// recipe uses it. Upstream sources, dependency pins and file lists are on the details page (componentDetailsText).
export function componentText(v: ComponentVersionView, origin: string): string {
  const f = v.foundations;
  const about = markdownSections(v.about);
  const section = (heading: string) => about.sections.find((s) => s.heading === heading)?.body;
  const examples = section("Examples");
  const settings = section("Settings");
  const more = about.sections.filter((s) => s.heading !== "Examples" && s.heading !== "Settings");
  return page(`${v.name} ${v.version}`, [
    ...(v.deprecations.length > 0 ? [...warnings(v.deprecations), `Deprecation tree: ${origin}/api/components/${v.slug}/${v.version}/deprecations`, ""] : []),
    v.description,
    ...(about.intro && about.intro !== v.description ? ["", about.intro] : []),
    ...(examples ? ["", "Examples", examples] : []),
    "",
    `Package URL: ${v.name}@${v.version}`,
    `Class: ${v.class.title} (${v.class.name}@${v.class.version}): ${v.classInfo.summary}. Any component of this class can fill a recipe slot that asks for it. Category ${v.category}; ${v.classInfo.url}.txt; ${v.classInfo.others} other component${v.classInfo.others === 1 ? "" : "s"} of this class: ${v.classInfo.othersUrl.replace("/components?", "/components.txt?")}`,
    "",
    `Provides (${v.provides.length})`,
    ...portLines(v.provides, (p) => `components that use it: ${origin}/components.txt?requires=${encodeURIComponent(p.type)}`),
    `Requires (${v.requires.length})`,
    ...portLines(v.requires, (p) => `components that provide it: ${origin}/components.txt?provides=${encodeURIComponent(p.type)}`),
    "",
    `Settings (${v.settings.length})`,
    ...(settings ? [settings] : []),
    ...v.settings.map(settingLine),
    `Depends on components: ${list(v.dependencies.map((x) => `${x.name} ${x.version}`))}`,
    "",
    ...recipeUseLines(v),
    `Used by recipes: ${list(v.usedBy.map((r) => `${r.name} ${r.version} (${r.slots.map((s) => `slot ${s.id}${s.preferred ? "" : " as a job candidate"}`).join(", ")})`))}`,
    ...more.flatMap((s) => ["", s.heading, s.body]),
    "",
    `Tags: ${list(v.tags)}`,
    `Targets: ${targets(v.targets)}`,
    publisherLine(v.publisher),
    `Guardians: ${list(v.guardians)}`,
    `Source: ${v.source.repository} release ${v.source.tag}; digest ${v.digest}`,
    ...releaseLines(v, "components", origin),
    `Bundle download: GET ${v.bundle.url} returns a link valid for one hour${v.status === "orphaned" ? "; with no publisher the link exists only while the release is public, otherwise the status is bundle-unavailable" : ""}`,
    "",
    ...classLines(f),
    ...requirementLines(f),
    "",
    `Suitable for jobs: ${list(v.suitability.jobs)}`,
    ...suitabilityLines(v.suitability),
    ...(v.suitability.notes ? [`Notes: ${v.suitability.notes}`] : []),
    v.migration ? `Data migration: stores ${list(v.migration.stores.map((s) => `${s.id} (${s.schema.name} ${s.schema.version})`))}; formats ${list(v.migration.formats)}; requires stop ${v.migration.requiresStop ? "yes" : "no"}; retention ${v.migration.retentionDays ?? "unspecified"} days` : "Data migration: this component keeps no data",
    `Maintainers: ${f.maintenance.owners.join(", ")}; ${f.maintenance.contact}; updates ${f.maintenance.updates.source} (${f.maintenance.updates.strategy})`,
    ...packageLines(v, componentsNotIncluded(v)),
    "",
    "Versions",
    ...versions(v),
    "",
    "Links",
    `Details (package foundations, upstream sources, exact dependencies, styles, class inventories, files): ${origin}/components/${v.slug}/details.txt?version=${v.version}`,
    `Page: ${origin}/components/${v.slug}; JSON: ${origin}/api/components/${v.slug}/${v.version}; connections diagram: ${origin}/api/components/${v.slug}/${v.version}/connections.svg`,
  ]);
}

// What a component's archive leaves out: the components that provide what it requires, and the application's settings.
const componentsNotIncluded = (v: ComponentVersionView): string =>
  `${v.requires.length === 0 ? "" : `the components that provide what it requires (${v.requires.map((r) => r.type).join(", ")}), each a separate download; `}the values of its settings, which the recipe writes; any secret`;

// The rest of a component: what the summary page leaves out.
export function componentDetailsText(v: ComponentVersionView, details: PackageDetails, origin: string): string {
  const f = details.foundations;
  return page(`${v.name} ${v.version}: details`, [
    `The component page, with its class, interfaces, settings and how to use it in a recipe: ${origin}/components/${v.slug}.txt?version=${v.version}`,
    `Digest: ${v.digest}`,
    `Bundle: ${v.bundle.asset} ${v.bundle.digest}`,
    ...packageLines(v, componentsNotIncluded(v)),
    ...foundationLines(f),
    "",
    `Files (${f.files.length})`,
    ...f.files.map((x) => `- ${x.path}${x.executable ? " (executable)" : ""}`),
    "",
    `Installed as (${f.artefacts.length})`,
    ...f.artefacts.map((a) => `- ${a.source} -> ${a.destination}${a.template ? " (template)" : ""}${a.executable ? " (executable)" : ""}`),
  ]);
}
