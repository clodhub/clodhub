// The signed-in frame: sidebar on desktop, tabs on phones.
import { ApiError, whoAmI, type Me } from "../api.js";
import { html, mount, type Raw } from "../html.js";
import { navigate } from "../nav.js";
import { setTheme } from "../theme.js";
import { avatar, icon, wireCopy, wireImages } from "../ui.js";
import { COPYRIGHT, SOURCE_URL, storeFrame } from "./public.js";
import { termsPending } from "./terms.js";

const NAV: { href: string; label: string; icon: string; match: (p: string) => boolean }[] = [
  { href: "/dev", label: "Developer", icon: "home", match: (p) => p === "/dev" },
  { href: "/recipes", label: "Recipes", icon: "devices", match: (p) => p.startsWith("/recipes") },
  { href: "/components", label: "Components", icon: "globe", match: (p) => p.startsWith("/components") },
  { href: "/classes", label: "Classes", icon: "apps", match: (p) => p.startsWith("/classes") || p.startsWith("/categories") },
  { href: "/guide", label: "Guide", icon: "book", match: (p) => p.startsWith("/guide") },
];

export function githubAvatar(me: Me): string {
  return `https://github.com/${me.developer.githubLogin}.png?size=96`;
}

// Resolve the signed-in developer or show the sign-in card; returns null when not signed in.
export async function requireMe(root: HTMLElement): Promise<Me | null> {
  setTheme("dev", "Developer");
  const me = await whoAmI(true);
  if (me && termsPending(me)) {
    navigate("/terms");
    return null;
  }
  if (me) return me;
  setTheme("store", "Sign in");
  mount(
    root,
    storeFrame(html`
      <div class="card pad-l center" style="max-width:520px;margin:40px auto">
        ${icon("logo", "icon-20")}
        <h1 style="margin:8px 0 6px">Publish on ClodHub</h1>
        <p class="muted">Sign in with GitHub to publish recipes and components, save the GitHub token publishing uses and make API keys for your agents. Only your public profile and organisation memberships are read. Reading the catalogue needs no sign-in.</p>
        <a class="btn lg mt" href="/api/auth/login">${icon("github")} Sign in with GitHub</a>
        <p class="small faint mt">New here? The <a href="/guide">guide</a> walks through finding, using and publishing recipes and components.</p>
      </div>
    `),
  );
  return null;
}

export function shell(me: Me, title: string, body: Raw, opts: { sub?: string; actions?: Raw; crumbs?: Raw; bare?: boolean } = {}): Raw {
  const path = location.pathname;
  const links = NAV.map((n) => html`<a class="nav ${n.match(path) ? "active" : ""}" href="${n.href}">${icon(n.icon)} ${n.label}</a>`);
  return html`
    <div class="shell">
      <aside class="side">
        <a class="brand" href="/">${icon("logo")}<span>ClodHub<small>Components and recipes</small></span></a>
        ${links}
        <div class="spacer"></div>
        <a class="nav" href="/components?publisher=${me.developer.slug}">${icon("eye")} My entries</a>
        <div class="who">${avatar(me.developer.displayName, githubAvatar(me))}<div class="grow"><b>${me.developer.displayName}</b><span>@${me.developer.githubLogin}</span><form method="post" action="/api/auth/logout"><button class="signout" type="submit">Sign out</button></form></div></div>
      </aside>
      <div class="main">
        <div class="topbar">
          <div class="row"><a class="brand" href="/" style="color:#fff">${icon("logo")} ClodHub</a>${avatar(me.developer.displayName, githubAvatar(me), "sm")}</div>
          <div class="tabs">${NAV.map((n) => html`<a class="${n.match(path) ? "active" : ""}" href="${n.href}">${n.label}</a>`)}<a href="/api/auth/logout" data-logout>Sign out</a></div>
        </div>
        <main class="content fade-in">
          ${opts.crumbs ? html`<div class="crumbs">${opts.crumbs}</div>` : ""}
          ${opts.bare ? "" : html`<div class="page-head"><div><h1>${title}</h1>${opts.sub ? html`<p>${opts.sub}</p>` : ""}</div>${opts.actions ?? ""}</div>`}
          ${body}
          <footer class="console-footer">${COPYRIGHT} · <a href="/terms">Terms</a> · <a href="/guide#security">Security</a> · <a href="${SOURCE_URL}" target="_blank" rel="noopener">Source</a></footer>
        </main>
      </div>
    </div>
  `;
}

export function mountShell(root: HTMLElement, me: Me, title: string, body: Raw, opts: Parameters<typeof shell>[3] = {}): void {
  setTheme("dev", `${title} · ClodHub`);
  mount(root, shell(me, title, body, opts));
  wireImages(root);
  wireCopy(root);
  root.querySelector<HTMLAnchorElement>("[data-logout]")?.addEventListener("click", (e) => {
    e.preventDefault();
    const f = document.createElement("form");
    f.method = "post";
    f.action = "/api/auth/logout";
    document.body.appendChild(f);
    f.submit();
  });
}

export function failed(root: HTMLElement, me: Me, err: unknown): void {
  const message = err instanceof ApiError ? err.message : String(err);
  mountShell(root, me, "Something went wrong", html`<div class="callout bad">${icon("warn")}<p>${message}</p></div>`);
}
