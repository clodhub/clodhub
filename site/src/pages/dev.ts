import { api, type ApiKey, type AuditEvent, type Me } from "../api.js";
import { html, type Raw } from "../html.js";
import { callout, copyRow, errorBox, fmtDate, icon, pill, toast, wireCopy } from "../ui.js";
import { AGENT_RECIPE_PROMPT } from "./prompts.js";
import { SOURCE_URL } from "./public.js";
import { failed, mountShell, requireMe } from "./shell.js";

function showError(root: HTMLElement, err: unknown, selector = "#error"): void {
  const box = root.querySelector<HTMLElement>(selector);
  if (box) box.innerHTML = errorBox(err).html;
  else toast(err instanceof Error ? err.message : String(err));
}

const EVENT_LABELS: Record<string, string> = {
  "sign-in": "Signed in",
  "sign-out": "Signed out",
  "sign-out-everywhere": "Signed out everywhere",
  "credentials-saved": "GitHub token saved",
  "credentials-removed": "GitHub token removed",
  "api-key-created": "API key created",
  "api-key-revoked": "API key revoked",
  "api-keys-revoked-all": "All API keys revoked",
  "terms-accepted": "Terms accepted",
  "recipe-published": "Recipe published",
  "recipe-unlisted": "Recipe unlisted",
  "component-published": "Component published",
  "component-updated": "Component text updated",
  "component-unlisted": "Component unlisted",
  "class-published": "Class published",
};

function savedMarker(present: boolean, savedAt: string | null): Raw {
  if (!present) return pill("not saved", "warn");
  return html`${pill(`saved${savedAt ? " " + fmtDate(savedAt, true) : ""}`, "ok", true)} <button type="button" class="btn sm ghost" id="remove-token">Remove</button>`;
}

// GET /dev: profile, GitHub token, API keys, security and account deletion on one page.
export async function developerPage(root: HTMLElement, note = ""): Promise<void> {
  const me = await requireMe(root);
  if (!me) return;
  let keys: ApiKey[] = [];
  let events: AuditEvent[] = [];
  try {
    [{ keys }, { events }] = await Promise.all([api<{ keys: ApiKey[] }>("GET", "/api/dev/keys"), api<{ events: AuditEvent[] }>("GET", "/api/dev/audit")]);
  } catch (err) {
    return failed(root, me, err);
  }
  const recipePrompt = AGENT_RECIPE_PROMPT();
  mountShell(
    root,
    me,
    "Developer",
    html`
      ${note ? callout("ok", html`<p>${note}</p>`) : ""}
      <div class="grid-2">
        <form id="me-form" class="card">
          <h2>Profile</h2>
          <div class="field"><label>Display name</label><input type="text" name="displayName" value="${me.developer.displayName}" required maxlength="80" /><div class="hint">Shown as the publisher of your recipes and components.</div></div>
          <div class="field"><label>Publisher name</label><input type="text" name="slug" value="${me.developer.slug}" required maxlength="40" /><div class="hint">Filters the catalogue to your entries: ${location.origin}/components?publisher=${me.developer.slug}</div></div>
          <div id="error"></div>
          <button class="btn" type="submit">Save profile</button>
        </form>
        <form id="token-form" class="card">
          <a id="credentials"></a>
          <h2>GitHub token</h2>
          <div class="row wrap mb">${savedMarker(me.secrets.github, me.secrets.githubSavedAt)}</div>
          <p class="small muted">Publishing checks with this token that you can push to the repository and that its release holds the package, and the bundle links read the release with it. It is stored encrypted and never shown again. <a href="/guide#github-token">How to create one</a>.</p>
          <div class="field"><label>Fine-grained token</label><input type="text" name="githubToken" autocomplete="off" placeholder="${me.secrets.github ? "saved; paste a new one to replace" : "github_pat_..."}" /><div class="hint">Repositories you publish from, with Contents read.</div></div>
          <div id="token-error"></div>
          <button class="btn" type="submit">Save token</button>
        </form>
      </div>

      <div class="grid-2 mt">
        <div class="card">
          <a id="keys"></a>
          <h2>API keys</h2>
          <p class="small muted">A key lets your agent or publish tool act as you within its scope. It can never create or revoke keys or change the GitHub token. Make one per agent or machine so you can revoke them one at a time.</p>
          <form id="key-form" class="mt">
            <div class="field"><label>Name</label><input type="text" name="name" placeholder="publish tool" maxlength="60" /></div>
            <div class="row wrap">
              <div class="field grow"><label>Scope</label><select name="scope"><option value="manage">Manage: publish, unlist and deprecate</option><option value="read">Read only: list and check</option></select></div>
              <div class="field grow"><label>Expires</label><select name="expiresInDays"><option value="30">30 days</option><option value="90" selected>90 days</option><option value="365">1 year</option><option value="">Never</option></select></div>
            </div>
            <button class="btn" type="submit">${icon("plus")} Create key</button>
          </form>
          <div id="key-error"></div>
          <div id="new-key"></div>
          <div class="mt" id="key-list">${keyList(keys)}</div>
          ${keys.length > 1 ? html`<button class="btn sm ghost mt" id="revoke-all">Revoke all keys</button>` : ""}
        </div>
        <div class="card">
          <h2>Quick reference</h2>
          <p class="small muted">Base URL <code>${location.origin}</code>. Header <code>Authorization: Bearer ch_...</code>. JSON in, JSON out, errors as <code>{"error": "..."}</code>. Reading needs no key.</p>
          <table class="table small mt-s">
            <tr><td><code>GET /api/dev/me</code></td><td>who the key belongs to</td></tr>
            <tr><td><code>POST /api/dev/components</code></td><td>publish a component version</td></tr>
            <tr><td><code>POST /api/dev/recipes</code></td><td>publish a recipe version</td></tr>
            <tr><td><code>POST /api/dev/classes</code></td><td>publish a class version</td></tr>
            <tr><td><code>PUT /api/dev/images/:sha256</code></td><td>upload an image an entry names</td></tr>
            <tr><td><code>GET /api/dev/components</code></td><td>your components with their versions</td></tr>
            <tr><td><code>DELETE /api/dev/components/:name[/:version]</code></td><td>unlist</td></tr>
            <tr><td><code>POST /api/dev/components/:name/deprecate</code></td><td>flag every version</td></tr>
          </table>
          <p class="small muted mt-s">Every request and answer: <a href="/agents.md">agents.md</a> and <a href="/contract.md">contract.md</a>. Source code and issues: <a href="${SOURCE_URL}" target="_blank" rel="noopener">github.com/clodhub/clodhub</a>.</p>
        </div>
      </div>

      <div class="card mt">
        <h2>Build an application from a recipe</h2>
        <p class="small muted">Give this to any coding agent. It finds a recipe and its components, asks you the recipe's questions, shows you what it will install, and installs with clod. It needs no API key.</p>
        <div class="prompt-box"><button class="btn sm secondary" data-copy="${recipePrompt}">${icon("copy")} Copy</button><pre>${recipePrompt}</pre></div>
      </div>

      <div class="grid-2 mt">
        <div class="card">
          <a id="security"></a>
          <div class="row wrap"><h2 class="grow">Security</h2><button class="btn sm danger" id="logout-all">Sign out everywhere</button></div>
          <p class="small muted">The GitHub token is encrypted with AES-256-GCM under a key derived for your account alone; the master secret lives only in the server's secret store. API keys and sessions are stored as keyed hashes, so a copy of the database cannot be used to sign in.</p>
          <h3 class="mt">Recent activity</h3>
          ${events.length === 0 ? html`<p class="small muted">Nothing recorded yet.</p>` : html`<table class="table small mt-s">${events.slice(0, 25).map((e) => html`<tr><td style="white-space:nowrap">${fmtDate(e.createdAt, true)}</td><td><b>${EVENT_LABELS[e.event] ?? e.event}</b>${e.detail ? html` <span class="muted">${e.detail}</span>` : ""}</td><td class="faint">${e.country ?? ""}</td></tr>`)}</table>`}
        </div>
        <div class="card">
          <h2>Account</h2>
          <dl class="kv">
            <dt>GitHub</dt><dd>@${me.developer.githubLogin}</dd>
            <dt>Member since</dt><dd>${fmtDate(me.developer.createdAt)}</dd>
            <dt>Terms</dt><dd>${me.developer.termsAcceptedVersion ? html`Version ${me.developer.termsAcceptedVersion}, accepted ${fmtDate(me.developer.termsAcceptedAt, true)}` : "not accepted"} · <a href="/terms">Read the terms</a></dd>
          </dl>
          <hr />
          <h3>Delete account</h3>
          <p class="small muted">Removes your profile, GitHub token and API keys at once. Your recipes and components stay in the catalogue without your name, marked orphaned; unlist them first to hide them.</p>
          <div class="row wrap"><input type="text" id="confirm-login" placeholder="Type ${me.developer.githubLogin} to confirm" style="flex:1;min-width:200px" /><button class="btn danger" id="delete-account" disabled>${icon("trash")} Delete my account</button></div>
          <div id="delete-error" class="mt-s"></div>
        </div>
      </div>
    `,
    { sub: "Your publisher profile, the GitHub token publishing uses, and keys for your agents." },
  );
  if (["#credentials", "#keys", "#security"].includes(location.hash)) root.querySelector(location.hash)?.scrollIntoView();

  const meForm = root.querySelector<HTMLFormElement>("#me-form")!;
  meForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(meForm);
    try {
      await api("PUT", "/api/dev/me", { displayName: fd.get("displayName"), slug: fd.get("slug") });
      await developerPage(root, "Profile saved.");
    } catch (err) {
      showError(root, err);
    }
  };
  const tokenForm = root.querySelector<HTMLFormElement>("#token-form")!;
  tokenForm.onsubmit = async (e) => {
    e.preventDefault();
    const value = String(new FormData(tokenForm).get("githubToken") ?? "").trim();
    if (value === "") return;
    try {
      await api("PUT", "/api/dev/secrets", { githubToken: value });
      await developerPage(root, "GitHub token saved.");
    } catch (err) {
      showError(root, err, "#token-error");
    }
  };
  root.querySelector<HTMLButtonElement>("#remove-token")?.addEventListener("click", async () => {
    if (!confirm("Remove the GitHub token? Publishing and bundle links for your entries stop working until you save one again.")) return;
    await api("PUT", "/api/dev/secrets", { githubToken: "-" });
    await developerPage(root, "GitHub token removed.");
  });

  const keyForm = root.querySelector<HTMLFormElement>("#key-form")!;
  keyForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(keyForm);
    const days = String(fd.get("expiresInDays") ?? "");
    try {
      const res = await api<{ key: string; apiKey: ApiKey }>("POST", "/api/dev/keys", { name: fd.get("name"), scope: fd.get("scope"), expiresInDays: days === "" ? null : Number(days) });
      const box = root.querySelector<HTMLElement>("#new-key")!;
      box.innerHTML = html`<div class="once mt"><b>${icon("lock", "icon-16")} Key for "${res.apiKey.name}", shown once</b>${copyRow(res.key)}<p class="small mt-s">Store it where the agent runs, for example <code>export CLODHUB_API_KEY=${res.key}</code>. It cannot be shown again.</p></div>`.html;
      wireCopy(box);
      keyForm.reset();
      await refreshKeys(root);
    } catch (err) {
      showError(root, err, "#key-error");
    }
  };
  wireKeyButtons(root);
  root.querySelector<HTMLButtonElement>("#revoke-all")?.addEventListener("click", async () => {
    if (!confirm("Revoke every API key? Every agent using one stops working at once.")) return;
    await api("POST", "/api/dev/keys/revoke-all");
    await developerPage(root, "All keys revoked.");
  });

  root.querySelector<HTMLButtonElement>("#logout-all")!.onclick = async () => {
    if (!confirm("Sign out of every browser, including this one? API keys stay valid; revoke them above if needed.")) return;
    await api("POST", "/api/auth/logout-everywhere");
    location.href = "/";
  };
  const confirmInput = root.querySelector<HTMLInputElement>("#confirm-login")!;
  const deleteBtn = root.querySelector<HTMLButtonElement>("#delete-account")!;
  confirmInput.oninput = () => (deleteBtn.disabled = confirmInput.value.trim() !== me.developer.githubLogin);
  deleteBtn.onclick = async () => {
    if (!confirm("Delete your account? This cannot be undone.")) return;
    try {
      await api("DELETE", "/api/dev/me", { confirm: confirmInput.value.trim() });
      location.href = "/";
    } catch (err) {
      showError(root, err, "#delete-error");
    }
  };
}

function keyList(keys: ApiKey[]): Raw {
  if (keys.length === 0) return html`<p class="small muted">No keys yet.</p>`;
  return html`${keys.map((k) => html`
    <div class="key-row">
      <div>
        <b>${k.name}</b> <code>${k.prefix}...</code> ${pill(k.scope === "read" ? "read only" : "manage", k.scope === "read" ? "" : "accent")}
        <div class="tiny faint">Created ${fmtDate(k.createdAt)}${k.expiresAt ? `, expires ${fmtDate(k.expiresAt)}` : ", no expiry"}${k.lastUsedAt ? `, last used ${fmtDate(k.lastUsedAt, true)}` : ", never used"}</div>
      </div>
      <button class="btn sm danger" data-revoke-key="${k.id}">Revoke</button>
    </div>`)}`;
}

function wireKeyButtons(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>("[data-revoke-key]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Revoke this key? Anything using it stops working at once.")) return;
    await api("DELETE", `/api/dev/keys/${b.dataset.revokeKey}`);
    toast("Key revoked");
    await refreshKeys(root);
  }));
}

async function refreshKeys(root: HTMLElement): Promise<void> {
  const { keys } = await api<{ keys: ApiKey[] }>("GET", "/api/dev/keys");
  const rows = root.querySelector<HTMLElement>("#key-list");
  if (!rows) return;
  rows.innerHTML = keyList(keys).html;
  wireKeyButtons(root);
}
