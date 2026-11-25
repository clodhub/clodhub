// The recipe library and the component catalogue: browse, search, and read one entry.
import type { BuildReportView, CategoryCount, ClassList, ClassVersionView, FoundationSummary, Foundations, ImageView, LineView, PackageDetails, Quality, VersionRef, VulnerabilityReport, VulnerabilitySummary } from "@clodhub/shared";
import { buildingItSection, groupHasMore, markdownSections, recipeBuildSteps, recipeUseSentence, PACKAGE_CHECK, PACKAGE_WHERE, QUALITY_LEVELS, QUALITY_TEXT, SIGNATURES_NOTE, classSettings, questionGroups, settingTypeWords, type BundleLink, type ClassInterface, type EntryPort, type PackageContents, type ComponentList, type ComponentSummary, type ComponentVersionView, type Deprecation, type EntryStatus, type Profile, type RecipeList, type RecipeSlotView, type RecipeSummary, type RecipeVersionView, type SettingDeclaration } from "@clodhub/shared";
import { ApiError, api, whoAmI } from "../api.js";
import { html, mount, raw, type Raw } from "../html.js";
import { svgFigure } from "../figures.js";
import { inline, renderMarkdown } from "../markdown.js";
import { CLIENT_TARGET_LABEL, type FilterKey, activeValues, answerText, conditionHtml, costLabel, deprecationAdvice, deprecationSentence, includedWhenHtml, loadText, queryString, readQuery, releaseUrl, statusLabel, targetLabel, versionFromSearch, withFilter, type LibraryQuery } from "../library.js";
import { navigate } from "../nav.js";
import { setTheme } from "../theme.js";
import { callout, copyRow, emptyState, errorBox, fmtDate, icon, toast, wireCopy } from "../ui.js";
import { notFound, storeFrame } from "./public.js";
import { mountShell } from "./shell.js";
import { termsPending } from "./terms.js";

type Kind = "recipes" | "components";

const none = html``;
const FOOTNOTE = "The catalogue is public. No tracking.";

function variants(path: string, version?: string): Raw {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : "";
  return html`<span class="small faint">Also as <a href="${path}.txt${suffix}">plain text</a> and <a href="${path}.json${suffix}">JSON</a>.</span>`;
}

function targetPills(targets: { client: string[]; server: string[] }): Raw {
  const all = [...targets.client, ...targets.server];
  return all.length === 0 ? html`<span class="small faint">No targets stated</span>` : html`<span class="row wrap" style="gap:6px">${all.map((t) => html`<span class="pill">${targetLabel(t)}</span>`)}</span>`;
}

function tagPills(tags: string[], kind: Kind): Raw {
  return tags.length === 0 ? none : html`<span class="row wrap" style="gap:6px">${tags.map((t) => html`<a class="pill" href="/${kind}?tag=${encodeURIComponent(t)}">${t}</a>`)}</span>`;
}

function publisherText(p: { displayName: string } | null): string {
  return p ? `By ${p.displayName}` : "Publisher's account deleted";
}

function statusPill(status: EntryStatus, deprecations: Deprecation[]): Raw {
  if (status === "orphaned") return html`<span class="pill bad">Orphaned</span>`;
  if (status === "deprecated") return html`<span class="pill warn">Deprecated</span>`;
  return deprecations.length > 0 ? html`<span class="pill warn">Uses deprecated parts</span>` : none;
}

// Banner at the top of a page: the entry's own flag, then every flagged part under it.
export function deprecationBanner(v: { name: string; version: string; status: EntryStatus; deprecations: Deprecation[] }, kind: Kind): Raw {
  if (v.deprecations.length === 0) return none;
  const own = v.deprecations.find((d) => d.name === v.name);
  const parts = v.deprecations.filter((d) => d !== own);
  const replacement = (d: Deprecation) => {
    if (!d.replacement) return none;
    const slug = d.replacement.split("/")[1];
    return html` Replacement: <a href="/${d.name === v.name ? kind : "components"}/${slug}">${d.replacement}</a>.`;
  };
  return html`
    <div class="mt" role="alert">
      ${callout(
        v.status === "orphaned" ? "bad" : "warn",
        html`
          ${own ? html`<p><b>${statusLabel(v.status)}.</b> ${deprecationSentence(own, v.name)}${replacement(own)} ${deprecationAdvice(v.status)}</p>` : none}
          ${parts.length > 0 ? html`<p><b>${kind === "recipes" ? "This recipe uses" : "This component builds on"} deprecated or orphaned components.</b> ${deprecationAdvice(parts.some((d) => d.status === "orphaned") ? "orphaned" : "deprecated")}</p><ul class="bullets">${parts.map((d) => html`<li>${deprecationSentence(d, v.name)}${replacement(d)}</li>`)}</ul>` : none}
          <p class="small">Machine-readable: <a href="/api/${kind}/${encodeURIComponent(v.name.split("/")[1])}/${v.version}/deprecations">deprecations</a>.</p>
        `,
      )}
    </div>
  `;
}

const QUALITY_OPTIONS = QUALITY_LEVELS.map((l) => ({ value: l, label: `${QUALITY_TEXT[l]} or above` }));
const SORT_LABEL: Record<string, string> = { relevance: "Best match", downloads: "Most downloads", trending: "Trending", updated: "Recently updated", name: "Name" };

function searchBox(kind: Kind, query: LibraryQuery): Raw {
  const label = kind === "recipes" ? "Search recipes by what the application does" : "Search components by name, class or what they do";
  return html`
    <form class="row" id="library-search" role="search" style="gap:8px">
      <input type="search" name="q" value="${query.q ?? ""}" placeholder="${label}" aria-label="${label}" maxlength="200" />
      <button class="btn" type="submit">Search</button>
    </form>
  `;
}

const fmtCount = (n: number): string => n.toLocaleString("en-GB");
const totalText = (t: { count: number; approximate: boolean }): string => (t.approximate ? `More than ${fmtCount(t.count)}` : fmtCount(t.count));

function facetLinks(kind: Kind, query: LibraryQuery, key: FilterKey, title: string, options: { value: string; label: string; count?: number }[]): Raw {
  if (options.length === 0) return none;
  return html`<div><h3>${title}</h3>${options.map((o) => html`<a href="/${kind}${queryString(withFilter(query, key, o.value))}" aria-current="${query[key] === o.value ? "true" : "false"}"><span>${o.label}</span>${o.count === undefined ? "" : html`<span class="count">${fmtCount(o.count)}</span>`}</a>`)}</div>`;
}

// Categories: the path to the chosen one, then its children with how many entries each holds.
function categoryFacet(kind: Kind, query: LibraryQuery, children: CategoryCount[]): Raw {
  const path = query.category ? query.category.split("/").map((_, i, all) => all.slice(0, i + 1).join("/")) : [];
  const key = kind === "recipes" ? "recipes" : "components";
  return html`<div><h3>Category</h3>
    <a href="/${kind}${queryString(withFilter(query, "category", undefined))}" aria-current="${query.category ? "false" : "true"}"><span>All</span></a>
    ${path.map((c) => html`<a href="/${kind}${queryString({ ...withFilter(query, "category", undefined), category: c })}" aria-current="${c === query.category ? "true" : "false"}"><span>${c.split("/").pop()}</span></a>`)}
    ${children.filter((c) => c[key] > 0).map((c) => html`<a href="/${kind}${queryString({ ...withFilter(query, "category", undefined), category: c.id })}" aria-current="false" style="padding-left:${8 + 10 * (path.length + 1)}px"><span>${c.title}</span><span class="count">${fmtCount(c[key])}</span></a>`)}
  </div>`;
}

function facets(kind: Kind, query: LibraryQuery, children: CategoryCount[]): Raw {
  const platforms = Object.entries({ ...CLIENT_TARGET_LABEL, server: "Server" }).map(([value, label]) => ({ value, label }));
  return html`<nav class="facets" aria-label="Filters">
    ${categoryFacet(kind, query, children)}
    ${facetLinks(kind, query, "platform", "Platform", platforms)}
    ${facetLinks(kind, query, "quality", "Quality", QUALITY_OPTIONS)}
    ${facetLinks(kind, query, "certified", "Reviewed by", [{ value: "true", label: "Level N (certified)" }, { value: "false", label: "Publisher's guardian" }])}
    ${facetLinks(kind, query, "channel", "Release channel", [{ value: "features", label: "Features" }, { value: "security", label: "Security" }, { value: "preview", label: "Preview" }])}
    ${facetLinks(kind, query, "secure", "Vulnerabilities", [{ value: "true", label: "None known" }])}
    ${facetLinks(kind, query, "licence", "Licence", ["Apache-2.0", "MIT", "BSD-3-Clause", "MPL-2.0"].map((l) => ({ value: l, label: l })))}
    ${facetLinks(kind, query, "deprecated", "Status", [{ value: "exclude", label: "Hide deprecated" }, { value: "only", label: "Only deprecated" }])}
  </nav>`;
}

function sortControl(kind: Kind, query: LibraryQuery): Raw {
  const sorts = (query.q ? ["relevance"] : []).concat(["downloads", "trending", "updated", "name"]);
  const current = query.sort ?? (query.q ? "relevance" : "downloads");
  return html`<label class="row small" style="gap:6px">Sort <select id="library-sort" aria-label="Sort">${sorts.map((s) => html`<option value="${s}" ${s === current ? raw("selected") : ""}>${SORT_LABEL[s]}</option>`)}</select></label>`;
}

function activeFilters(kind: Kind, query: LibraryQuery): Raw {
  const active = activeValues(query).filter((a) => a.key !== "q" && a.key !== "category");
  if (active.length === 0) return none;
  return html`<p class="small muted mt-s">${active.map((a) => html`<a class="pill accent" href="/${kind}${queryString(withFilter(query, a.key, a.key === "provides" || a.key === "requires" ? a.value : undefined))}">${a.key} ${a.value} &times;</a> `)}</p>`;
}

function pager(kind: Kind, query: LibraryQuery, list: { next: string | null; previous: string | null }): Raw {
  if (!list.next && !list.previous) return none;
  const page = (cursor: string) => `/${kind}${queryString({ ...query, cursor })}`;
  return html`<div class="row mt" style="justify-content:space-between"><span>${list.previous ? html`<a class="btn secondary sm" href="${page(list.previous)}">Previous</a>` : ""}</span><span>${list.next ? html`<a class="btn secondary sm" href="${page(list.next)}">Next</a>` : ""}</span></div>`;
}

export function qualityBadge(q: Quality | null): Raw {
  if (!q) return none;
  return html`<span class="pill badge-quality" title="Quality level from verified evidence">${QUALITY_TEXT[q.level]}</span>${q.certified ? html` <span class="pill badge-certified" title="Reviewed by a Level N guardian">Certified</span>` : ""}`;
}

function vulnerabilityBadge(n: number | null): Raw {
  return n !== null && n > 0 ? html`<span class="pill badge-vulnerable">${n} known ${n === 1 ? "vulnerability" : "vulnerabilities"}</span>` : none;
}

function thumb(url: string | null, alt: string): Raw {
  return url ? html`<img class="thumb" src="${url}" alt="${alt}" loading="lazy" width="480" height="300" />` : html`<div class="thumb none">No image</div>`;
}

function cardMeta(e: { downloads: number; updatedAt: string; platforms: string[]; channel: string }): Raw {
  return html`<div class="meta"><span>${e.platforms.filter((p) => p !== "server").map(targetLabel).join(", ") || "Server"}</span><span>${fmtCount(e.downloads)} downloads</span><span>updated ${fmtDate(e.updatedAt)}</span>${e.channel === "preview" ? html`<span>preview</span>` : ""}</div>`;
}

export function recipeCard(r: RecipeSummary): Raw {
  return html`
    <article class="entry-card">
      <a href="/recipes/${r.slug}" tabindex="-1" aria-hidden="true">${thumb(r.thumbnail, "")}</a>
      <div class="body">
        <h3><a href="/recipes/${r.slug}">${r.title}</a></h3>
        <p class="muted small" style="margin:0">${r.summary}</p>
        <div class="row wrap" style="gap:6px">${statusPill(r.status, r.deprecations)}${qualityBadge(r.quality)}${vulnerabilityBadge(r.vulnerabilities)}<a class="pill" href="/recipes?category=${encodeURIComponent(r.category)}">${r.category}</a></div>
        ${cardMeta(r)}
      </div>
    </article>
  `;
}

export function componentCard(c: ComponentSummary): Raw {
  return html`
    <article class="entry-card">
      <a href="/components/${c.slug}" tabindex="-1" aria-hidden="true">${thumb(c.thumbnail, "")}</a>
      <div class="body">
        <h3><a href="/components/${c.slug}">${c.name}</a></h3>
        <p class="muted small" style="margin:0">${c.description}</p>
        <p class="small" style="margin:0">Class <a href="/classes/${c.class.name.split("/")[1]}">${c.class.title}</a></p>
        <div class="row wrap" style="gap:6px">${statusPill(c.status, c.deprecations)}${qualityBadge(c.quality)}${vulnerabilityBadge(c.vulnerabilities)}</div>
        ${cardMeta(c)}
      </div>
    </article>
  `;
}

function wireListing(root: HTMLElement, kind: Kind | "classes", query: LibraryQuery): void {
  root.querySelector<HTMLFormElement>("#library-search")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = root.querySelector<HTMLInputElement>("#library-search input")!.value.trim();
    const next = { ...withFilter(query, "q", q || undefined) };
    if (!q && next.sort === "relevance") delete next.sort;
    navigate(`/${kind}${queryString(next)}`);
  });
  root.querySelector<HTMLSelectElement>("#library-sort")?.addEventListener("change", (event) => {
    navigate(`/${kind}${queryString({ ...withFilter(query, "sort", undefined), sort: (event.target as HTMLSelectElement).value })}`);
  });
}

// Signed-in developers see the library inside the console frame (sidebar kept); everyone else gets the public store frame.
function showInFrame(root: HTMLElement, me: Awaited<ReturnType<typeof whoAmI>>, title: string, body: Raw, opts: { sub?: string; bare?: boolean } = {}, publicBody: Raw = body): void {
  if (me && !termsPending(me)) mountShell(root, me, title, body, opts);
  else mount(root, storeFrame(publicBody, { me, footnote: FOOTNOTE }));
}

const LEAD: Record<Kind | "classes", [string, string]> = {
  recipes: ["Recipes: applications you can build from questions", "A recipe asks a few questions, then an agent assembles the application from reviewed components for the devices you choose."],
  components: ["Components: the reviewed parts recipes are made from", "Each component implements a class: the interfaces it provides and requires and the settings a recipe writes. Components of one class can stand in for each other."],
  classes: ["Classes: what a component must do to fill a slot", "A class names the interfaces, settings and shared checks of one kind of part. Compare the components that implement it side by side."],
};

function listFrame(root: HTMLElement, kind: Kind | "classes", query: LibraryQuery, controls: Raw, body: Raw, me: Awaited<ReturnType<typeof whoAmI>>): void {
  const [title, lead] = LEAD[kind];
  const links = html`<p class="small mt-s">${variants(`/${kind}`)} ${(["recipes", "components", "classes"] as const).filter((k) => k !== kind).map((k) => html`<a href="/${k}">${k[0]!.toUpperCase()}${k.slice(1)}</a> `)}<a href="/categories">Categories</a></p>`;
  const publicBody = html`
      <section style="padding:26px 0 6px">
        <span class="pill accent">${kind === "recipes" ? "Recipes" : kind === "components" ? "Components" : "Classes"}</span>
        <h1 style="margin-top:10px">${title}</h1>
        <p class="lead muted">${lead}</p>
        ${controls}${links}
      </section>
      ${body}
    `;
  showInFrame(root, me, kind[0]!.toUpperCase() + kind.slice(1), html`<section style="padding:0 0 6px">${controls}${links}</section>${body}`, { sub: lead }, publicBody);
}

async function listingPage(root: HTMLElement, kind: Kind): Promise<void> {
  setTheme("store", kind === "recipes" ? "Recipes on ClodHub" : "Components on ClodHub", true);
  const query = readQuery(location.search);
  const me = await whoAmI();
  const controls = html`${searchBox(kind, query)}`;
  try {
    const list = await api<RecipeList | ComponentList>("GET", `/api/${kind}${queryString(query)}`);
    const entries = kind === "recipes" ? (list as RecipeList).recipes : (list as ComponentList).components;
    const heading = html`<div class="row wrap" style="justify-content:space-between"><p class="muted" style="margin:0">${totalText(list.total)} ${kind}${query.category ? html` in <b>${query.category}</b>` : ""}${query.q ? html` matching <b>${query.q}</b>` : ""}</p>${sortControl(kind, query)}</div>${activeFilters(kind, query)}`;
    const cards = entries.length === 0
      ? emptyState("apps", `No ${kind} match`, "Try fewer words, or remove a filter.")
      : html`<div class="entry-grid mt-s">${kind === "recipes" ? (entries as RecipeSummary[]).map(recipeCard) : (entries as ComponentSummary[]).map(componentCard)}</div>`;
    const body = html`<div class="catalogue">${facets(kind, query, list.categories)}<div>${heading}${cards}${pager(kind, query, list)}</div></div>`;
    listFrame(root, kind, query, controls, body, me);
  } catch (err) {
    listFrame(root, kind, query, controls, errorBox(err), me);
  }
  wireListing(root, kind, query);
}

export const recipesPage = (root: HTMLElement): Promise<void> => listingPage(root, "recipes");
export const componentsPage = (root: HTMLElement): Promise<void> => listingPage(root, "components");

function versionList(kind: Kind, slug: string, current: string, versions: VersionRef[]): Raw {
  return html`
    <table class="table">
      <tr><th>Version</th><th>Channel</th><th>Published</th><th>Digest</th></tr>
      ${versions.map((v) => html`<tr><td>${v.version === current ? html`<b>${v.version}</b>` : html`<a href="/${kind}/${slug}?version=${v.version}">${v.version}</a>`}</td><td>${v.channel}${v.fixes.length > 0 ? html`<br /><span class="small muted">fixes ${v.fixes.join(", ")}</span>` : ""}</td><td>${fmtDate(v.publishedAt)}</td><td><code class="small">${v.digest.slice(0, 19)}</code></td></tr>`)}
    </table>
  `;
}

// The images of the package as built: the main one large, the others below it; a click shows one large.
export function gallery(images: ImageView[]): Raw {
  if (images.length === 0) return none;
  const first = images[0]!;
  return html`<figure class="gallery" id="gallery" style="margin:14px 0 0">
    <img class="main-image" src="${first.url}" alt="${first.caption}" width="${first.width}" height="${first.height}" />
    <figcaption>${first.caption} <span class="faint">(${targetLabel(first.platform)})</span></figcaption>
    ${images.length > 1 ? html`<div class="strip">${images.map((i, n) => html`<img src="${i.thumbnail}" alt="${i.caption}" data-image="${n}" loading="lazy" />`)}</div>` : ""}
  </figure>`;
}

function wireGallery(root: HTMLElement, images: ImageView[]): void {
  const main = root.querySelector<HTMLImageElement>("#gallery .main-image");
  const caption = root.querySelector<HTMLElement>("#gallery figcaption");
  root.querySelectorAll<HTMLImageElement>("#gallery [data-image]").forEach((img) => (img.onclick = () => {
    const i = images[Number(img.dataset.image)]!;
    main!.src = i.url;
    main!.alt = i.caption;
    caption!.textContent = `${i.caption} (${targetLabel(i.platform)})`;
  }));
}

// Channel, quality, vulnerabilities and the security releases on this version's line.
export function releaseCard(kind: Kind, slug: string, v: { version: string; release: { channel: string; fixes: string[] }; line: LineView; quality: Quality | null; vulnerabilitySummary: VulnerabilitySummary; vulnerabilityWaivers: { id: string; reason: string }[]; downloads: number; versionDownloads: number }): Raw {
  const s = v.vulnerabilitySummary;
  return html`<div class="card mt" id="release">
    <h2>This release</h2>
    <table class="table small">
      <tr><td>Channel</td><td><b>${v.release.channel}</b>${v.release.fixes.length > 0 ? html`: fixes ${v.release.fixes.join(", ")}` : v.release.channel === "preview" ? ": not for production" : ""}</td></tr>
      <tr><td>Line ${v.line.line}</td><td>${v.line.securityReleases.length === 0 ? "No security releases on this line." : html`Security releases: ${v.line.securityReleases.map((r, i) => html`${i > 0 ? "; " : ""}<a href="/${kind}/${slug}?version=${r.version}">${r.version}</a> fixes ${r.fixes.join(", ")}`)}`}</td></tr>
      <tr><td>Quality</td><td>${v.quality ? html`${qualityBadge(v.quality)}${v.quality.liveTested ? html` <span class="muted">on ${targetLabel(v.quality.liveTested.platform)}, ${fmtDate(v.quality.liveTested.at)}</span>` : ""}` : html`<span class="muted">Not assessed by the catalogue's publish tool.</span>`}</td></tr>
      <tr><td>Known vulnerabilities</td><td>${s.count === null ? html`<span class="muted">${s.checkedAt ? "Unknown: OSV could not check one of its package URLs." : "Not checked yet."}</span>` : s.count === 0 ? "None known" : html`<span class="pill badge-vulnerable">${s.count}</span> <a href="${new URL(s.url).pathname}">the advisories</a>`}${s.checkedAt ? html` <span class="muted">(checked at OSV ${fmtDate(s.checkedAt)})</span>` : ""}${v.vulnerabilityWaivers.length > 0 ? html`<br /><span class="small muted">Waived by the publisher: ${v.vulnerabilityWaivers.map((w) => `${w.id} (${w.reason})`).join("; ")}</span>` : ""}</td></tr>
      <tr><td>Downloads</td><td>${fmtCount(v.downloads)} in the last 30 days; ${fmtCount(v.versionDownloads)} of this version</td></tr>
    </table>
  </div>`;
}

function profileRows(profiles: Profile[]): Raw {
  return html`
    ${profiles.map(
      (p) => html`<tr>
        <td><b>${p.id}</b>${p.provider ? html`<br /><span class="small muted">${p.provider.name}, ${p.provider.tier}</span>` : ""}</td>
        <td>${costLabel(p.cost)}</td>
        <td>${loadText(p.load)}</td>
        <td>${p.regions.join(", ")}${p.compliance.length > 0 ? html`<br /><span class="small muted">${p.compliance.join(", ")}</span>` : ""}</td>
      </tr>`,
    )}
  `;
}

function suitabilityTable(profiles: Profile[]): Raw {
  return html`<table class="table"><tr><th>Profile</th><th>Cost</th><th>Load it carries</th><th>Regions and compliance</th></tr>${profileRows(profiles)}</table>`;
}

function wireBundle(root: HTMLElement, url: string): void {
  const button = root.querySelector<HTMLButtonElement>("#bundle-link");
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    try {
      const link = await api<BundleLink>("GET", new URL(url).pathname);
      if (link.url === null) toast("This bundle cannot be downloaded: its publisher deleted their account and the release is not public.");
      else location.assign(link.url);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    } finally {
      button.disabled = false;
    }
  };
}

// What a download is, at a glance: the same words appear in the plain-text pages and the documents.
// The aepm steps the agent runs, then the recipe author's own "Building it" section.
export function buildStepsHtml(v: RecipeVersionView): Raw {
  const own = buildingItSection(v.description);
  return html`
    <details class="mt-s" open>
      <summary>The steps your agent runs</summary>
      <ol class="steps">
        ${recipeBuildSteps(v).map((s) => html`<li>${s.text}${s.command ? html`<br /><code class="small">${s.command}</code>` : ""}</li>`)}
      </ol>
      ${own ? html`<h3 class="mt">From the recipe</h3><div class="markdown">${raw(renderMarkdown(own.text))}</div>${own.cut ? html`<p class="small muted">The rest is in the description below.</p>` : ""}` : ""}
    </details>
  `;
}

// Agents' runs of the recipe, newest first (spec section 6b).
export function buildReportsCard(v: { version: string; buildReports: BuildReportView[] }): Raw | string {
  if (v.buildReports.length === 0) return "";
  return html`
    <div class="card mt" id="build-reports">
      <h2>Build reports (${v.buildReports.length})</h2>
      <p class="muted">Coding agents building an application from this recipe, as the person saw each run.</p>
      ${v.buildReports.map(
        (r) => html`
          <div class="build-report mt" id="report-${r.id}">
            <h3>Version ${r.version}, ${r.date}</h3>
            ${r.current ? "" : html`<p class="small muted">This report is of version ${r.version}; the current version is ${v.version}.</p>`}
            <p class="small">${r.agent.harness}, ${r.agent.model}. ${r.activeMinutes} active minutes, US$${r.costUsd.toFixed(2)}. Rated ${r.rating.score} of ${r.rating.of} by ${r.rating.by}.</p>
            <table class="table">
              <tr><th>Target</th><th>Built</th><th>Tested</th><th>Ran</th></tr>
              ${r.results.map((x) => html`<tr><td>${x.target}</td><td>${x.built ? "yes" : "no"}</td><td>${x.tested}</td><td>${x.ran}</td></tr>`)}
            </table>
            ${r.problems.length > 0 ? html`<details class="mt-s"><summary>Problems (${r.problems.length})</summary><ul class="bullets">${r.problems.map((p) => html`<li>${p}</li>`)}</ul></details>` : html`<p class="small muted">No problems reported.</p>`}
            <p class="small muted">Most helpful next: ${r.rating.mostHelpful}. <a href="${r.url}">The full report</a></p>
          </div>`,
      )}
    </div>
  `;
}

// What the archive holds, from its file list: each kind of file with a few of its paths, where installing puts the
// files that go into the application, and what is left out.
export function packageCard(v: { bundle: { asset: string }; digest: string; source: { repository: string; tag: string }; contents: PackageContents }, notIncluded: Raw | string, extra: Raw | string = ""): Raw {
  const c = v.contents;
  return html`
          <div class="card mt" id="what-you-download">
            <h2>What you download</h2>
            <p><code>${v.bundle.asset}</code>, one archive from <a href="${releaseUrl(v.source.repository, v.source.tag)}" target="_blank" rel="noopener">the ${v.source.tag} release of ${v.source.repository}</a>, holding ${fmtCount(c.files)} files.</p>
            ${extra}
            <table class="table small mt-s">
              <tr><th>What</th><th>Files</th><th>For example</th></tr>
              ${c.groups.map((g) => html`<tr><td>${g.label}</td><td>${fmtCount(g.count)}</td><td class="small">${g.examples.map((x, i) => html`${i > 0 ? ", " : ""}<code>${x}</code>`)}${groupHasMore(g) ? ", ..." : ""}</td></tr>`)}
            </table>
            <p class="mt-s">Installing copies ${fmtCount(c.installed.count)} of them into your application${c.installed.root ? html` under <code>${c.installed.root}</code>` : ""}: ${c.installed.folders.map((f, i) => html`${i > 0 ? ", " : ""}${f.folder} ${f.count}`)}.</p>
            <p>Not included: ${notIncluded}.</p>
            <p class="small muted">${PACKAGE_WHERE} ${PACKAGE_CHECK} <a href="#package-facts">Package facts</a> says where the signatures are and links the full file list.</p>
            <div class="row wrap"><button class="btn secondary sm" id="bundle-link" type="button">${icon("external")} Download the archive</button><span class="small faint">The link is valid for one hour. Digest <code>${v.digest.slice(0, 19)}</code></span></div>
          </div>
  `;
}

const relative = (url: string): string => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

function interfaceList(list: ClassInterface[]): Raw {
  return list.length === 0 ? html`none` : html`${list.map((p, i) => html`${i > 0 ? ", " : ""}<code>${p.type}</code> ${p.version}${p.optional ? " (optional)" : ""}`)}`;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const listText = (items: string[]): string => (items.length === 0 ? "none declared" : items.join(", "));
const runtimesText = (f: FoundationSummary): string => listText(Object.entries(f.runtimes).map(([name, range]) => `${name} ${range}`));
const frameworksText = (f: FoundationSummary): string => listText(Object.entries(f.frameworks).map(([role, x]) => `${role}: ${x.name} ${x.range}`));

// One slot: its id and condition, its class (its interfaces and settings are on the class page), the preferred component
// with what it does, where it runs and its guardians, and the other components of its class.
function slotRow(s: RecipeSlotView): Raw {
  return html`<tr>
    <td><code>${s.id}</code>${s.includedWhen ? html`<br /><span class="small muted">${includedWhenHtml(s)}</span>` : ""}</td>
    <td><a href="${relative(s.classInfo.url)}">${s.classInfo.title}</a><br /><span class="small muted">${s.classInfo.summary}</span><br /><span class="small faint"><code>${s.class.name}</code> ${s.class.version}</span>
      ${s.catalogue ? html`<details class="mt-s small"><summary>Where it runs and who reviewed it</summary>
        ${s.catalogue.profiles.map((p) => html`<div><b>${p.id}</b>: ${costLabel(p.cost)}, ${loadText(p.load)}</div>`)}
        <p class="muted">Guardians: ${s.catalogue.guardians.length > 0 ? s.catalogue.guardians.join(", ") : "none recorded"}</p>
      </details>` : ""}</td>
    <td>${s.preferred.url ? html`<a href="${relative(s.preferred.url)}">${s.preferred.name.split("/")[1]}</a>` : s.preferred.name}${s.deprecation ? html` ${statusPill(s.deprecation.status, [s.deprecation])}` : none} <span class="small faint">${s.preferred.version}</span>${s.catalogue ? html`<br /><span class="small muted">${s.catalogue.description}</span>` : html`<br /><span class="small muted">Not in the catalogue.</span>`}</td>
    <td><a href="${relative(s.alternatives.url)}">${s.alternatives.count} other${s.alternatives.count === 1 ? "" : "s"}</a></td>
  </tr>`;
}

function settingsTable(settings: SettingDeclaration[]): Raw {
  return html`<table class="table"><tr><th>Setting</th><th>Type</th><th>Default</th><th>The recipe</th></tr>${settings.map(
    (s) => html`<tr><td><code>${s.id}</code></td><td>${settingTypeWords(s)}${s.secret ? html` <span class="small muted">a reference to a secret, never its value</span>` : ""}</td><td>${s.hasDefault ? html`<code>${JSON.stringify(s.default)}</code>` : html`<span class="muted">none</span>`}</td><td>${s.required && !s.hasDefault ? "must set it" : "may set it"}</td></tr>`,
  )}</table>`;
}

const deviceLabel = (platform: string): string => (platform === "server" ? "Server" : targetLabel(platform));

// One provided or required interface: its id and type, linked to the components on the other side, and what it is.
function portItem(p: EntryPort, other: "provides" | "requires"): Raw {
  return html`<li><code>${p.id}</code>${p.optional ? html` <span class="small muted">optional</span>` : ""} <a class="small" href="/components?${other}=${encodeURIComponent(p.type)}">${p.type} ${p.version}</a>${p.description ? html`<br /><span class="small muted">${raw(inline(p.description))}</span>` : ""}</li>`;
}

// The first part of a description (up to its first second-level heading) and the rest.
export function splitDescription(markdown: string): [string, string] {
  const at = markdown.search(/\n## /);
  return at < 0 ? [markdown, ""] : [markdown.slice(0, at), markdown.slice(at + 1)];
}

const detailsPath = (kind: Kind, slug: string, version: string): string => `/${kind}/${slug}/details?version=${encodeURIComponent(version)}`;

// Package facts as counts, with one link to the lists.
export function factsCard(f: FoundationSummary, kind: Kind, slug: string, version: string): Raw {
  return html`<div class="card mt" id="package-facts"><h2>Package facts</h2>
    <p class="small muted">Declared by the publisher. ${SIGNATURES_NOTE}</p>
    <table class="table small mt-s">
      <tr><td>Licence</td><td>${f.licence}</td></tr>
      ${kind === "recipes" ? html`<tr><td>Platforms</td><td>${f.platforms.join(", ")}</td></tr><tr><td>Toolchains</td><td>${runtimesText(f)}</td></tr><tr><td>Frameworks</td><td>${frameworksText(f)}</td></tr>` : ""}
      <tr><td>Contents</td><td>${count(f.counts.upstream, "upstream source", "upstream sources")}, ${count(f.counts.dependencies, "exact dependency", "exact dependencies")}, ${count(f.counts.classes, "class", "classes")}, ${count(f.counts.files, "file", "files")}, ${count(f.counts.artefacts, "installed file", "installed files")}; stylesheets ${f.styles.scope} (${count(f.styles.namespaces, "global name", "global names")}, ${count(f.styles.conflicts, "conflict", "conflicts")})</td></tr>
      <tr><td>Maintainers</td><td>${f.maintenance.owners.join(", ")} (${f.maintenance.contact}); updates from <a href="${f.maintenance.updates.source}">${f.maintenance.updates.source}</a> (${f.maintenance.updates.strategy})</td></tr>
    </table>
    <p class="mt-s"><a href="${detailsPath(kind, slug, version)}">Sources and dependencies</a></p>
  </div>`;
}

export function recipeBody(v: RecipeVersionView, requested: string): Raw {
  const [intro, rest] = splitDescription(v.description);
  return html`
        <article style="max-width:900px;margin:0 auto">
          <p class="small"><a href="/recipes">All recipes</a></p>
          <div class="row wrap top" style="justify-content:space-between">
            <div class="grow">
              <span class="pill accent">${v.category}</span> <span class="pill">${v.version}</span>
              <h1 style="margin-top:10px">${v.title}</h1>
              <p class="lead muted">${v.summary}</p>
            </div>
          </div>
          ${deprecationBanner(v, "recipes")}
          <div class="row wrap" style="gap:8px">${qualityBadge(v.quality)}${vulnerabilityBadge(v.vulnerabilities)}${targetPills(v.targets)}${tagPills(v.tags, "recipes")}</div>
          <p class="small muted mt-s">${publisherText(v.publisher)}. Source <a href="${releaseUrl(v.source.repository, v.source.tag)}" target="_blank" rel="noopener">${v.source.repository} ${v.source.tag}</a>.</p>
          ${gallery(v.images)}

          ${packageCard(v, `the ${v.components.length} components of its slots; each is a separate download, fetched by exact version and checked against its digest`, html`<p><code>recipe.json</code> holds its ${v.questions.length} questions, ${v.components.length} slots and ${v.tests.answerSets.length + 1} tested answer sets; <code>${v.instructions}</code> tells your agent how to build and run it.</p>`)}

          <div class="card mt" id="build-it">
            <h2>Build it</h2>
            <p class="muted">Give your coding agent this line. The page it reads lists the aepm steps: fetch the recipe and its components, ask you the questions below, design, install, then build and run. <a href="/agents.md">Tools and instructions for agents</a>. With no machine of your own: <a href="/cloud-assembly.md">build it in GitHub Actions</a>.</p>
            ${copyRow(`Build an application from the ${v.title} recipe: https://clodhub.com/recipes/${v.slug}.txt`)}
            ${buildStepsHtml(v)}
          </div>

          ${buildReportsCard(v)}

          <div class="card mt" id="about">
            <h2>About</h2>
            <div class="markdown">${raw(renderMarkdown(intro))}</div>
            ${rest ? html`<details class="mt-s"><summary>The full description</summary><div class="markdown">${raw(renderMarkdown(rest))}</div></details>` : ""}
          </div>

          <div class="card mt" id="questions">
            <h2>Questions it asks (${v.questions.length})</h2>
            ${v.questions.length === 0 ? html`<p class="muted">This recipe asks no questions.</p>` : questionGroups(v.questions).map((g) => html`
              <h3 class="mt">${g.heading} (${g.questions.length})</h3>
              <table class="table">
                <tr><th>Question</th><th>Answer</th><th>${g.ask === "required" ? "" : "Default"}</th></tr>
                ${g.questions.map((q) => html`<tr><td>${q.question}<br /><code class="small">${q.id}</code>${q.askWhen ? html`<br /><span class="small muted">Follow-up: asked when ${conditionHtml(q.askWhen)}</span>` : ""}</td><td>${q.type}${q.options ? html`<br /><span class="small muted">${q.options.join(", ")}</span>` : ""}</td><td>${q.type === "secretRef" ? "a reference, never a value" : g.ask === "required" ? "" : answerText(q.default)}</td></tr>`)}
              </table>`)}
          </div>

          <div class="card mt" id="slots">
            <h2>Its parts (${v.components.length} slots)</h2>
            <p class="muted small">Each slot is one part of the application, filled by a component of the slot's class. The recipe prefers one component; your agent may fill the slot with any other component of the class (<code>aepm alternatives</code> lists them, <code>aepm design --substitute</code> uses one). Every component is checked at build time for the release and guardian signatures the owner trusts.</p>
            <table class="table" style="table-layout:fixed">
              <colgroup><col style="width:18%" /><col style="width:34%" /><col style="width:36%" /><col style="width:12%" /></colgroup>
              <tr><th>Slot</th><th>What it is</th><th>Preferred component</th><th>Alternatives</th></tr>
              ${v.components.map(slotRow)}
            </table>
          </div>

          ${v.jobs.length > 0 || v.scale ? html`
            <div class="card mt">
              <h2>Choosing by suitability</h2>
              ${v.scale ? html`<p class="muted">The <code>${v.scale.question}</code> question sets the load the application must carry.</p><ul class="bullets">${v.scale.bands.map((b) => html`<li><b>${b.id}</b>: ${b.label.startsWith(`${b.id}:`) ? b.label.slice(b.id.length + 1).trim() : b.label} (${loadText(b.load)})</li>`)}</ul>` : ""}
              ${v.jobs.map((j) => html`<p><b>${j.id}</b> fills slot <code>${j.slot}</code>: ${j.candidates.map((c, i) => html`${i > 0 ? ", " : ""}${c.component}${c.version ? ` ${c.version}` : ""} (${c.profile})${c.includedWhen ? html` when ${conditionHtml(c.includedWhen)}` : ""}`)}${j.overrideQuestion ? html`<br /><span class="small muted">The answer to <code>${j.overrideQuestion}</code> restricts the candidates first.</span>` : ""}</p>`)}
            </div>` : ""}

          <div class="card mt" id="how-components-connect">
            <h2>How its components connect</h2>
            <p class="muted small">Drawn by ClodHub from the recipe and the catalogue: each component in a zone by category, each line an interface from the component that provides it to the one that requires it.</p>
            ${svgFigure(`/api/recipes/${v.slug}/${v.version}/components.svg`, `Diagram of the ${v.components.length} components of ${v.title}, grouped by category, with ${v.connections.length} lines from each component that provides an interface to each component that requires it.`)}
            ${v.diagram ? html`<h3 class="mt">Publisher's diagram</h3>${svgFigure(v.diagram, `The publisher's design diagram of ${v.title}`)}` : ""}
          </div>

          <div class="card mt">
            <h2>Targets</h2>
            <p><b>Client</b> ${v.targets.client.length === 0 ? "none" : v.targets.client.map(targetLabel).join(", ")}</p>
            <p><b>Server</b> ${v.targets.server.length === 0 ? "none" : v.targets.server.map(targetLabel).join(", ")}</p>
          </div>

          <div class="card mt" id="tested">
            <h2>Tested answer sets (${v.tests.answerSets.length + 1})</h2>
            <p class="muted">Every combination of answers cannot be tested. These were: the defaults${v.tests.answerSets.length > 0 ? `, ${v.tests.answerSets.map((s) => s.id).join(", ")}` : ""}.</p>
            ${v.tests.answerSets.length === 0 ? "" : html`<details><summary>The answers of each set</summary><ul class="bullets">${v.tests.answerSets.map((s) => html`<li><b>${s.id}</b>: ${Object.keys(s.answers).length === 0 ? "defaults" : Object.entries(s.answers).map(([k, a]) => `${k} ${answerText(a)}`).join("; ")}</li>`)}</ul></details>`}
          </div>

          ${releaseCard("recipes", v.slug, v)}
          ${factsCard(v.foundations, "recipes", v.slug, v.version)}

          <div class="card mt">
            <h2>Versions</h2>
            ${versionList("recipes", v.slug, v.version, v.versions)}
          </div>
          <p class="mt">${variants(`/recipes/${v.slug}`, requested === "latest" ? undefined : v.version)}</p>
        </article>
  `;
}

export async function recipePage(root: HTMLElement, slug: string): Promise<void> {
  setTheme("store", "Recipe on ClodHub", true);
  const me = await whoAmI();
  const requested = versionFromSearch(location.search);
  let v: RecipeVersionView;
  try {
    v = await api<RecipeVersionView>("GET", `/api/recipes/${encodeURIComponent(slug)}/${requested}`);
  } catch (err) {
    return notFound(root, err instanceof ApiError && err.status === 404 ? "No such recipe or version." : String(err));
  }
  setTheme("store", `${v.title}: a recipe on ClodHub`, true);
  showInFrame(root, me, v.title, recipeBody(v, requested), { bare: true });
  wireCopy(root);
  wireBundle(root, v.bundle.url);
  wireGallery(root, v.images);
}

// The recipe.json slot entry that names a component, from the class it implements.
export function slotSnippet(v: ComponentVersionView): string | null {
  const c = v.foundations.implements[0]?.reference;
  return c ? JSON.stringify({ id: v.slug, class: { name: c.name, version: c.version, digest: c.digest }, preferred: { name: v.name, version: v.version } }) : null;
}

export function componentBody(v: ComponentVersionView, requested: string): Raw {
  const f = v.foundations;
  const snippet = slotSnippet(v);
  const about = markdownSections(v.about);
  const section = (heading: string) => about.sections.find((s) => s.heading === heading);
  const examples = section("Examples");
  const settingsText = section("Settings");
  const more = about.sections.filter((s) => s !== examples && s !== settingsText);
  const md = (text: string) => html`<div class="markdown">${raw(renderMarkdown(text))}</div>`;
  const modules = f.implements.flatMap((c) => c.provides.flatMap((p) => Object.entries(p.modules).map(([platform, paths]) => ({ type: p.type, platform, paths }))));
  const notIncluded = html`${v.requires.length > 0 ? html`the components that provide what it needs (${v.requires.map((r, i) => html`${i > 0 ? ", " : ""}<a href="/components?provides=${encodeURIComponent(r.type)}">${r.type}</a>`)}), each a separate download; ` : ""}the values of its settings, which the recipe writes; any secret`;
  return html`
        <article style="max-width:900px;margin:0 auto">
          <p class="small"><a href="/components">All components</a></p>
          <div>
            <span class="pill accent">${v.category}</span> <span class="pill">${v.version}</span>
            <h1 style="margin-top:10px">${v.name}</h1>
            <p class="lead muted">${v.description}</p>
          </div>
          ${deprecationBanner(v, "components")}
          <div class="row wrap" style="gap:8px">${qualityBadge(v.quality)}${vulnerabilityBadge(v.vulnerabilities)}${targetPills(v.targets)}${tagPills(v.tags, "components")}</div>
          <p class="small muted mt-s">${publisherText(v.publisher)}. A component of class <a href="${relative(v.classInfo.url)}">${v.class.title}</a> in <a href="/components?category=${encodeURIComponent(v.category)}">${v.category}</a>. Source <a href="${releaseUrl(v.source.repository, v.source.tag)}" target="_blank" rel="noopener">${v.source.repository} ${v.source.tag}</a>.</p>
          ${gallery(v.images)}

          <div class="card mt" id="about">
            <h2>What it is</h2>
            ${about.intro && about.intro !== v.description ? md(about.intro) : html`<p>${v.description}</p>`}
            ${examples ? html`<h3 class="mt">Examples</h3>${md(examples.body)}` : ""}
          </div>

          <div class="card mt" id="class">
            <h2>Its class: <a href="${relative(v.classInfo.url)}">${v.class.title}</a></h2>
            <p>${v.classInfo.summary}.</p>
            <p class="small muted">A class is one kind of part: the interfaces and settings every component of the class has, and the checks they all pass. A recipe asks for a part by its class, so any component of the class can fill that slot.</p>
            <p><a href="${relative(v.classInfo.othersUrl)}">${v.classInfo.others === 0 ? "No other component implements it yet" : `${v.classInfo.others} other component${v.classInfo.others === 1 ? " implements" : "s implement"} it`}</a> · <a href="${relative(v.classInfo.url)}">The class page</a> <span class="small faint"><code>${v.class.name}</code> ${v.class.version}</span></p>
            ${modules.length === 0 ? "" : html`<h3 class="mt">Where its code starts, per device</h3>
              <table class="table small"><tr><th>Device</th><th>Interface</th><th>Entry module</th></tr>${modules.map((m) => html`<tr><td>${deviceLabel(m.platform)}</td><td><code>${m.type}</code></td><td>${m.paths.map((x, i) => html`${i > 0 ? ", " : ""}<code>${x}</code>`)}</td></tr>`)}</table>`}
          </div>

          <div class="card mt" id="interfaces">
            <h2>What it provides and what it needs</h2>
            <h3>Provides</h3>
            ${v.provides.length === 0 ? html`<p class="muted">Nothing other components connect to.</p>` : html`<ul class="bullets">${v.provides.map((p) => portItem(p, "requires"))}</ul>`}
            <h3 class="mt">Needs</h3>
            ${v.requires.length === 0 ? html`<p class="muted">Nothing from other components.</p>` : html`<ul class="bullets">${v.requires.map((p) => portItem(p, "provides"))}</ul>`}
            <p class="small muted">Each type links to the catalogue components on the other side: those that use what it provides, and those that provide what it needs.</p>
          </div>

          <div class="card mt" id="settings">
            <h2>Settings</h2>
            ${settingsText ? md(settingsText.body) : ""}
            ${v.settings.length === 0 ? html`<p class="muted">It has no settings.</p>` : settingsTable(v.settings)}
          </div>

          <div class="card mt" id="use-it">
            <h2>Use it in a recipe</h2>
            ${snippet
              ? html`<p>${recipeUseSentence(v)}</p><p class="small muted mt-s">The slot in <code>recipe.json</code> <code>components</code>:</p>${copyRow(snippet)}<p class="small muted mt-s">In place of another component of its class: <code>aepm fetch ${v.name}@${v.version} --from https://clodhub.com</code>, then <code>aepm design ... --substitute SLOT=${v.name}@${v.version}</code>.</p>`
              : html`<p class="muted">It implements no class, so no slot can name it.</p>`}
            <p class="small muted">Guardians: ${v.guardians.length === 0 ? "none recorded for this version" : v.guardians.join(", ")}.</p>
            <h3 class="mt">Recipes that use it</h3>
            ${v.usedBy.length === 0 ? html`<p class="muted">No listed recipe names it yet.</p>` : html`<ul class="bullets">${v.usedBy.map((r) => html`<li><a href="/recipes/${r.slug}">${r.title}</a> ${r.version}: ${r.slots.map((s, i) => html`${i > 0 ? ", " : ""}slot <code>${s.id}</code>${s.preferred ? "" : " as a job candidate"}`)}</li>`)}</ul>`}
          </div>

          ${more.length === 0 ? "" : html`<div class="card mt" id="more">
            <h2>More about it</h2>
            ${more.map((s) => html`<details class="mt-s"><summary><b>${s.heading}</b></summary>${md(s.body)}</details>`)}
          </div>`}

          <div class="card mt" id="what-it-connects-to">
            <h2>What it connects to</h2>
            <p class="muted small">Left: the catalogue components that provide what it needs. Right: the catalogue components that use what it provides.</p>
            ${svgFigure(`/api/components/${v.slug}/${v.version}/connections.svg`, `Diagram of ${v.name} ${v.version}: on the left the ${v.requires.length} interfaces it requires and the catalogue components that provide them, on the right the ${v.provides.length} interfaces it provides and the catalogue components that require them.`)}
          </div>

          ${v.dependencies.length > 0 ? html`<div class="card mt"><h2>Builds on</h2><ul class="bullets">${v.dependencies.map((d) => html`<li><a href="/components/${d.name.split("/")[1]}">${d.name}</a> ${d.version}</li>`)}</ul></div>` : none}

          ${packageCard(v, notIncluded)}

          <div class="card mt" id="platforms">
            <h2>Devices and toolchains</h2>
            <table class="table small">
              <tr><td>Devices</td><td>${f.platforms.map(deviceLabel).join(", ")}</td></tr>
              <tr><td>Toolchains</td><td>${runtimesText(f)}</td></tr>
              <tr><td>Frameworks</td><td>${frameworksText(f)}</td></tr>
            </table>
          </div>

          <div class="card mt">
            <h2>Where it runs and what it costs</h2>
            <p class="muted">Jobs a recipe can choose it for: ${v.suitability.jobs.join(", ")}.</p>
            ${suitabilityTable(v.suitability.profiles)}
            ${v.suitability.notes ? html`<p class="small muted mt-s">${v.suitability.notes}</p>` : ""}
          </div>

          <div class="card mt">
            <h2>Data and migration</h2>
            ${v.migration
              ? html`<p>Keeps data in ${v.migration.stores.map((s) => `${s.id} (${s.schema.name} ${s.schema.version})`).join(", ")}. Moves as ${v.migration.formats.join(", ")}; ${v.migration.requiresStop ? "it must stop while data moves" : "it can keep running while data moves"}. ${v.migration.retentionDays === null ? "" : `Data is kept ${v.migration.retentionDays} days after removal.`}</p>`
              : html`<p class="muted">This component keeps no data.</p>`}
          </div>

          ${releaseCard("components", v.slug, v)}
          ${factsCard(f, "components", v.slug, v.version)}

          <div class="card mt">
            <h2>Versions</h2>
            ${versionList("components", v.slug, v.version, v.versions)}
          </div>
          <p class="mt">${variants(`/components/${v.slug}`, requested === "latest" ? undefined : v.version)}</p>
        </article>
  `;
}

export async function componentPage(root: HTMLElement, slug: string): Promise<void> {
  setTheme("store", "Component on ClodHub", true);
  const me = await whoAmI();
  const requested = versionFromSearch(location.search);
  let v: ComponentVersionView;
  try {
    v = await api<ComponentVersionView>("GET", `/api/components/${encodeURIComponent(slug)}/${requested}`);
  } catch (err) {
    return notFound(root, err instanceof ApiError && err.status === 404 ? "No such component or version." : String(err));
  }
  setTheme("store", `${v.name}: a component on ClodHub`, true);
  showInFrame(root, me, v.name, componentBody(v, requested), { bare: true });
  wireCopy(root);
  wireBundle(root, v.bundle.url);
  wireGallery(root, v.images);
}

const section = (title: string, count: number, body: Raw): Raw => html`<details class="card mt"><summary><b>${title} (${count})</b></summary>${count === 0 ? html`<p class="muted">None.</p>` : body}</details>`;

function deliveryText(d: Foundations["upstream"][number]["delivery"]): string {
  if (d.kind === "bundled") return `bundled: ${d.files.map((x) => x.path).join(", ")}`;
  return `fetched at build time by ${d.manager}, pinned by ${d.lock}`;
}

// Sources and dependencies: the package foundations in full, each list closed until opened.
export function detailsBody(d: PackageDetails, kind: Kind, slug: string): Raw {
  const f = d.foundations;
  const styles = f.compatibility.styles;
  return html`
        <article style="max-width:900px;margin:0 auto">
          <p class="small"><a href="/${kind}/${slug}?version=${encodeURIComponent(d.version)}">${d.name} ${d.version}</a></p>
          <h1>Sources and dependencies</h1>
          <p class="lead muted">${d.name} ${d.version}: the package foundations its publisher declared.</p>
          <p class="small muted">${SIGNATURES_NOTE}</p>
          ${section("Upstream sources", f.upstream.length, html`<table class="table small"><tr><th>Source</th><th>Licence</th><th>How it is delivered</th></tr>${f.upstream.map((u) => html`<tr><td><a href="${u.repository}">${u.name}</a> ${u.version}<br /><code>${u.purl}</code>${u.revision ? html`<br />revision ${u.revision}` : ""}</td><td>${u.licence}<br /><span class="muted">${u.notices.join(", ")}</span></td><td>${deliveryText(u.delivery)}</td></tr>`)}</table>`)}
          ${section("Exact dependencies", f.compatibility.dependencies.length, html`<table class="table small"><tr><th>Dependency</th><th>Version</th><th>Isolation</th></tr>${f.compatibility.dependencies.map((x) => html`<tr><td><code>${x.name}</code></td><td>${x.version}</td><td>${x.isolation}</td></tr>`)}</table>`)}
          ${section("Stylesheet global names", styles.namespaces.length, html`<p class="small">Scope ${styles.scope}. Conflicts: ${styles.conflicts.join(", ") || "none"}.</p><ul class="bullets small">${styles.namespaces.map((n) => html`<li><code>${n}</code></li>`)}</ul>`)}
          ${section("Classes", f.classes.length, html`${f.classes.map((c) => html`<div class="mt-s small"><p><b>${c.reference.name}</b> ${c.reference.version} <code>${c.reference.digest}</code></p><p>Provides ${interfaceList(c.descriptor.provides)}; requires ${interfaceList(c.descriptor.requires)}.</p><p>Shared behaviour suites: ${c.descriptor.verification.map((x) => `${x.id} (${x.argv.join(" ")})`).join(", ")}</p><p>Inventory: ${c.descriptor.inventory.map((x) => x.path).join(", ")}</p></div>`)}`)}
          ${section("Files", f.files.length, html`<ul class="bullets small">${f.files.map((x) => html`<li><code>${x.path}</code>${x.executable ? " (executable)" : ""}</li>`)}</ul>`)}
          ${section("Installed files", f.artefacts.length, html`<ul class="bullets small">${f.artefacts.map((a) => html`<li><code>${a.source}</code> to <code>${a.destination}</code>${a.template ? " (template)" : ""}</li>`)}</ul>`)}
          <p class="mt"><span class="small faint">Also as <a href="/${kind}/${slug}/details.txt?version=${encodeURIComponent(d.version)}">plain text</a> and <a href="/api/${kind}/${slug}/${encodeURIComponent(d.version)}/details">JSON</a>.</span></p>
        </article>
  `;
}

export async function detailsPage(root: HTMLElement, kind: Kind, slug: string): Promise<void> {
  setTheme("store", "Sources and dependencies on ClodHub", true);
  const me = await whoAmI();
  const requested = versionFromSearch(location.search);
  let d: PackageDetails;
  try {
    d = await api<PackageDetails>("GET", `/api/${kind}/${encodeURIComponent(slug)}/${requested}/details`);
  } catch (err) {
    return notFound(root, err instanceof ApiError && err.status === 404 ? "No such entry or version." : String(err));
  }
  setTheme("store", `${d.name} ${d.version}: sources and dependencies`, true);
  showInFrame(root, me, `${d.name}: sources and dependencies`, detailsBody(d, kind, slug), { bare: true });
}

// ---------------------------------------------------------------- classes and categories

function classCard(c: ClassList["classes"][number]): Raw {
  return html`<article class="card">
    <h3 style="margin:0"><a href="/classes/${c.slug}">${c.title}</a></h3>
    <p class="muted small" style="margin:4px 0">${c.summary}</p>
    <div class="row wrap small" style="gap:6px"><a class="pill" href="/classes?category=${encodeURIComponent(c.category)}">${c.category}</a><span class="pill">${c.presentation === "visual" ? "visual" : "no visual output"}</span><a href="/components?class=${encodeURIComponent(c.name)}">${fmtCount(c.implementations)} implementations</a></div>
    <p class="small faint" style="margin:6px 0 0"><code>${c.name}</code> ${c.version}</p>
  </article>`;
}

export async function classesPage(root: HTMLElement): Promise<void> {
  setTheme("store", "Classes on ClodHub", true);
  const query = readQuery(location.search);
  const me = await whoAmI();
  try {
    const list = await api<ClassList>("GET", `/api/classes${queryString({ category: query.category, cursor: query.cursor })}`);
    const children = html`<nav class="facets" aria-label="Categories"><div><h3>Category</h3><a href="/classes" aria-current="${query.category ? "false" : "true"}"><span>All</span></a>${query.category ? html`<a href="/classes?category=${encodeURIComponent(query.category)}" aria-current="true"><span>${query.category}</span></a>` : ""}${list.categories.filter((c) => c.classes > 0).map((c) => html`<a href="/classes?category=${encodeURIComponent(c.id)}" aria-current="false"><span>${c.title}</span><span class="count">${fmtCount(c.classes)}</span></a>`)}</div></nav>`;
    const body = html`<div class="catalogue">${children}<div><p class="muted" style="margin:0">${totalText(list.total)} classes</p>${list.classes.length === 0 ? emptyState("apps", "No classes here", "Choose another category.") : html`<div class="entry-grid mt-s">${list.classes.map(classCard)}</div>`}${pager("classes" as Kind, { category: query.category }, list)}</div></div>`;
    listFrame(root, "classes", query, none, body, me);
  } catch (err) {
    listFrame(root, "classes", query, none, errorBox(err), me);
  }
}

// One class: what it asks of a component, and the components that implement it, side by side.
export function classBody(c: ClassVersionView): Raw {
  const settings = classSettings(c.settings);
  return html`
    <article style="max-width:980px;margin:0 auto">
      <p class="small"><a href="/classes">All classes</a> · <a href="/categories">Categories</a></p>
      <span class="pill accent">${c.category}</span> <span class="pill">${c.version}</span> <span class="pill">${c.presentation === "visual" ? "visual" : "no visual output"}</span>
      <h1 style="margin-top:10px">${c.title}</h1>
      <p class="lead muted">${c.summary}</p>
      <p class="small faint"><code>${c.name}</code> sha256 <code>${c.digest.slice(0, 16)}</code></p>

      <div class="card mt" id="implementations">
        <h2>Implementations (${fmtCount(c.implementations)})</h2>
        <p class="muted small">Every listed component whose newest version implements this class version, most downloaded first. Any of them can fill a recipe slot of this class.</p>
        ${c.implementationList.length === 0 ? html`<p class="muted">No listed component implements it yet.</p>` : html`<div style="overflow-x:auto"><table class="table compare-table">
          <tr><th></th><th>Component</th><th>Quality</th><th>Platforms</th><th>Downloads</th><th>Vulnerabilities</th></tr>
          ${c.implementationList.map((i) => html`<tr><td>${i.thumbnail ? html`<img src="${i.thumbnail}" alt="" loading="lazy" />` : html`<span class="faint small">No image</span>`}</td><td><a href="/components/${i.slug}">${i.name}</a> ${i.version}<br /><span class="small muted">${i.description}</span></td><td>${qualityBadge(i.quality)}${i.quality ? "" : html`<span class="small muted">not assessed</span>`}</td><td class="small">${i.platforms.map(targetLabel).join(", ")}</td><td>${fmtCount(i.downloads)}</td><td>${i.vulnerabilities === null ? html`<span class="small muted">not checked</span>` : i.vulnerabilities === 0 ? "none known" : html`<span class="pill badge-vulnerable">${i.vulnerabilities}</span>`}</td></tr>`)}
        </table></div>`}
        ${c.implementations > c.implementationList.length ? html`<p class="small mt-s"><a href="/components?class=${encodeURIComponent(c.name)}">All ${fmtCount(c.implementations)} implementations</a></p>` : ""}
      </div>

      <div class="grid-2 mt">
        <div class="card"><h2>Provides</h2>${c.provides.length === 0 ? html`<p class="muted">None.</p>` : html`<ul class="bullets small">${c.provides.map((p) => html`<li><code>${p.type}</code> ${p.version}<br /><span class="muted">${Object.entries(p.modules).map(([k, v]) => `${targetLabel(k)}: ${v.join(", ")}`).join("; ")}</span></li>`)}</ul>`}</div>
        <div class="card"><h2>Requires</h2>${c.requires.length === 0 ? html`<p class="muted">None.</p>` : html`<ul class="bullets small">${c.requires.map((p) => html`<li><code>${p.type}</code> ${p.version}</li>`)}</ul>`}</div>
      </div>

      <div class="card mt">
        <h2>Settings a recipe writes</h2>
        ${settings.length === 0 ? html`<p class="muted">None.</p>` : html`<table class="table small"><tr><th>Setting</th><th>Type</th><th></th></tr>${settings.map((p) => html`<tr><td><code>${p.id}</code></td><td>${p.kind ? settingTypeWords(p.kind) : "unknown"}</td><td>${p.required ? "always written" : "optional"}</td></tr>`)}</table>`}
      </div>

      <div class="card mt">
        <h2>Shared checks</h2>
        <p class="muted small">Every implementation passes these checks; aepm runs them when a component is substituted.</p>
        <table class="table small"><tr><th>Check</th><th>Command</th><th>Limit</th></tr>${c.suites.map((s) => html`<tr><td>${s.id}</td><td><code>${s.argv.join(" ")}</code></td><td>${s.timeoutSeconds} s${s.network ? ", network" : ""}</td></tr>`)}</table>
      </div>

      <div class="card mt">
        <h2>Versions</h2>
        <table class="table small"><tr><th>Version</th><th>Published</th><th>Digest</th></tr>${c.versions.map((v) => html`<tr><td>${v.version === c.version ? html`<b>${v.version}</b>` : html`<a href="/classes/${c.slug}?version=${v.version}">${v.version}</a>`}</td><td>${fmtDate(v.publishedAt)}</td><td><code>${v.digest.slice(0, 16)}</code></td></tr>`)}</table>
      </div>
      <p class="mt">${variants(`/classes/${c.slug}`)}</p>
    </article>`;
}

export async function classPage(root: HTMLElement, slug: string): Promise<void> {
  setTheme("store", "Class on ClodHub", true);
  const me = await whoAmI();
  let c: ClassVersionView;
  try {
    c = await api<ClassVersionView>("GET", `/api/classes/${encodeURIComponent(slug)}/${versionFromSearch(location.search)}`);
  } catch (err) {
    return notFound(root, err instanceof ApiError && err.status === 404 ? "No such class or version." : String(err));
  }
  setTheme("store", `${c.title}: a class on ClodHub`, true);
  showInFrame(root, me, c.title, classBody(c), { bare: true });
}

export function categoriesBody(categories: CategoryCount[]): Raw {
  const depth = (id: string) => id.split("/").length - 1;
  return html`<article style="max-width:900px;margin:0 auto">
    <h1>Categories</h1>
    <p class="lead muted">The category tree of classes. A component's category is its class's category; a category counts everything below it.</p>
    <table class="table mt">
      <tr><th>Category</th><th>Classes</th><th>Components</th><th>Recipes</th></tr>
      ${categories.map((c) => html`<tr><td style="padding-left:${10 + 18 * depth(c.id)}px">${c.title} <span class="small faint">${c.id}</span></td><td><a href="/classes?category=${encodeURIComponent(c.id)}">${fmtCount(c.classes)}</a></td><td><a href="/components?category=${encodeURIComponent(c.id)}">${fmtCount(c.components)}</a></td><td><a href="/recipes?category=${encodeURIComponent(c.id)}">${fmtCount(c.recipes)}</a></td></tr>`)}
    </table>
    <p class="mt">${variants("/categories")}</p>
  </article>`;
}

export async function categoriesPage(root: HTMLElement): Promise<void> {
  setTheme("store", "Categories on ClodHub", true);
  const me = await whoAmI();
  try {
    const tree = await api<{ categories: CategoryCount[] }>("GET", "/api/categories");
    showInFrame(root, me, "Categories", categoriesBody(tree.categories), { bare: true });
  } catch (err) {
    showInFrame(root, me, "Categories", errorBox(err), { bare: true });
  }
}
