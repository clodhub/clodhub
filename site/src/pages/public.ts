import { whoAmI, type Me } from "../api.js";
import { html, mount, type Raw } from "../html.js";
import { cookingFigure } from "../figures.js";
import { setTheme } from "../theme.js";
import { avatar, icon, wireCopy, wireImages } from "../ui.js";

// Shared frame for every public page.
export const COPYRIGHT = "Copyright Level N Ltd 2026";
export const TAGLINE = "Reviewed components and recipes that AI agents assemble into apps.";
export const SOURCE_URL = "https://github.com/clodhub/clodhub";

export function storeFrame(body: Raw, opts: { me?: Me | null; nav?: boolean; footnote?: string } = {}): Raw {
  const right = opts.me
    ? html`<a href="/dev" class="row" style="gap:8px">${avatar(opts.me.developer.displayName, `https://github.com/${opts.me.developer.githubLogin}.png?size=64`, "sm")} <span>Developer</span></a>`
    : html`<a href="/dev">Publish</a>`;
  const nav = opts.nav === false ? "" : html`<nav class="store-nav"><a class="brand" href="/">${icon("logo")} ClodHub</a><span class="row wrap" style="gap:18px"><a href="/recipes">Recipes</a><a href="/components">Components</a><a href="/classes">Classes</a><a href="/guide">Guide</a>${right}</span></nav>`;
  const footer = html`<footer class="store-footer"><span>${COPYRIGHT} · <a href="/terms">Terms</a> · <a href="${SOURCE_URL}" target="_blank" rel="noopener">Source</a></span><span>${opts.footnote ?? "The catalogue is public. No tracking."}</span></footer>`;
  return html`<div class="store fade-in">${nav}${body}${footer}</div>`;
}

const AEPM_STEPS = `git clone https://github.com/clodhub/aepm
python3 -m aepm fetch <recipe>@<version> --with-dependencies --store store
python3 -m aepm questions <recipe>@<version> --store store
python3 -m aepm design <recipe>@<version> --store store --answers answers.json --out definition.json
python3 -m aepm resolve definition.json --catalogue store/catalogue.json --out lock.json
python3 -m aepm install definition.json --lock lock.json --store store --policy policy.json --target app
python3 -m aepm verify app --policy policy.json --trusted`;

export async function landing(root: HTMLElement): Promise<void> {
  setTheme("store", `ClodHub: ${TAGLINE}`, true);
  const me = await whoAmI();
  mount(
    root,
    storeFrame(
      html`
        <section class="hero">
          <div>
            <span class="pill accent">${icon("bot", "icon-16")} Components and recipes for AI agents</span>
            <h1 style="margin-top:14px">${TAGLINE}</h1>
            <p class="lead">ClodHub is a catalogue of reviewed components and recipes. A <b>component</b> is a reviewed part of an application, such as a card deck, a seating plan or a video call. A <b>recipe</b> lists the components an application needs, the questions that choose between them and how they connect. Your coding agent answers a recipe's questions with you, and aepm, the installer, puts the application together from those parts on your own accounts.</p>
            <div class="ctas">
              <a class="btn lg" href="/recipes">Browse recipes ${icon("arrow")}</a>
              <a class="btn lg secondary" href="/components">Browse components</a>
            </div>
            <p class="small faint mt">Reading the catalogue needs no account. Publishers sign in with GitHub; their packages stay in their own GitHub releases.</p>
          </div>
          <div class="card">
            <h3>What an agent runs</h3>
            <p class="small muted">Each recipe's page gives these steps with its own name and version. aepm checks every archive's fingerprint and signatures, and installs without running any package's code.</p>
            <pre class="small" style="white-space:pre-wrap">${AEPM_STEPS}</pre>
          </div>
        </section>

        <section class="how" id="what">
          <div class="section-title"><h2>What is in the catalogue</h2></div>
          <div class="grid-3">
            <div class="card"><h3>Components</h3><p class="muted">Reviewed parts with a contract: what each provides and needs, the settings it takes, the devices it runs on, who it suits and how its data moves. <a href="/components">Components</a>.</p></div>
            <div class="card"><h3>Classes</h3><p class="muted">The contract a component fills: interfaces, settings and shared tests. Components of one class can stand in for each other in a recipe. <a href="/classes">Classes</a>.</p></div>
            <div class="card"><h3>Recipes</h3><p class="muted">The questions an application asks, the slot each component fills and how the parts connect, tested with named sets of answers. <a href="/recipes">Recipes</a>.</p></div>
          </div>
        </section>

        <section class="how" id="why">
          <div class="section-title"><h2>Why build from reviewed parts</h2></div>
          <div class="grid-3">
            <div class="card"><h3>Fast and low cost</h3><p class="muted">An application from a recipe in minutes, with little AI spending, because the agent assembles parts rather than writing them.</p></div>
            <div class="card"><h3>Checked before it runs</h3><p class="muted">Every version is bound to its fingerprint, reviewed, checked for known vulnerabilities, and tested by its class's shared tests.</p></div>
            <div class="card"><h3>Yours</h3><p class="muted">The application runs on your own accounts with your own data. Every update is proposed, and you approve it before it is applied.</p></div>
          </div>
        </section>

        <section class="how" id="how">
          <div class="section-title"><h2>How a recipe is cooked</h2></div>
          <p class="muted">Your agent answers a recipe's questions with you. The answers decide which reviewed components go in and which providers they use. aepm downloads each one from its publisher, checks it and installs it without running its code. The application runs on your own accounts, <a href="https://ourapps.app">ourapps.app</a> can deliver it to your people through one link, and every update waits for your approval.</p>
          ${cookingFigure()}
        </section>

        <section class="card pad-l" style="margin-top:14px">
          <div class="row wrap top" style="gap:20px">
            <div style="flex:1 1 300px">
              <span class="pill accent">Why small is powerful</span>
              <h2 style="margin-top:8px">At a small organisation's size, the expensive parts are free</h2>
              <p class="muted">Video calls, live multiplayer, databases and AI cost a public app money every month. For a household, a club or a practice of fewer than ten people they fit inside free plans. A larger organisation answers one question about its size, and the recipe picks the provider tier that fits.</p>
            </div>
            <div class="stack" style="flex:0 0 auto"><a class="btn" href="/small">How it works ${icon("arrow")}</a><a class="btn secondary" href="/free-tiers.md">The list of free services</a></div>
          </div>
        </section>

        <div class="card mt pad-l row wrap" style="justify-content:space-between">
          <div style="flex:1 1 260px"><h3>Agents welcome</h3><p class="muted small">Every page has a plain-text and a JSON version, and the whole catalogue is an API. Publishers give their publish tool an API key from the developer page.</p></div>
          <div class="row wrap">${me ? html`<a class="btn secondary" href="/dev">Developer page</a>` : html`<a class="btn secondary" href="/dev">Publish on ClodHub</a>`}<a class="btn secondary" href="/agents.md">Read agents.md ${icon("external")}</a></div>
        </div>
      `,
      { me },
    ),
  );
  wireImages(root);
  wireCopy(root);
}

export function notFound(root: HTMLElement, message = "There is nothing at this address."): void {
  setTheme("store", "Not found");
  mount(root, storeFrame(html`<div class="card pad-l center" style="margin-top:30px"><h1>Not found</h1><p class="muted">${message}</p><a class="btn secondary mt" href="/">Go to the start</a></div>`));
}
