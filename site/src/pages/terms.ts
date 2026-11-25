// Terms of use and data statement, shown at sign-up and reachable from every footer.
import { TERMS_VERSION } from "@clodhub/shared";
import { api, whoAmI, type Me } from "../api.js";
import { html, mount, type Raw } from "../html.js";
import { navigate } from "../nav.js";
import { setTheme } from "../theme.js";
import { callout, icon, toast, wireImages } from "../ui.js";
import { storeFrame } from "./public.js";

export { TERMS_VERSION };

export function termsBody(): Raw {
  return html`
    <article class="story terms">
      <h1 style="font-size:34px">Terms of use and data statement</h1>
      <p class="muted">Version ${TERMS_VERSION}. Plain words on purpose. ClodHub is operated by Level N Ltd.</p>

      <h2>1. What ClodHub is</h2>
      <p>ClodHub is a public catalogue of recipes (applications assembled from questions), components (reviewed parts) and classes (the contracts components fill). Developers publish them from their own GitHub repositories, and anyone can browse and search them, with a plain-text and a JSON version of every page for agents.</p>
      <p>ClodHub keeps the page details of a recipe or component and pointers to the publisher's own GitHub release; it does not keep the packages, and serves them through links that expire after an hour. It is not a store: there is no transaction between you and the people who build from what you publish.</p>

      <h2>2. Who the terms apply to</h2>
      <p>These terms are between Level N Ltd and you, the developer who signs in. People who only read the catalogue do not sign in and hold no account; what the service records about them is in section 4.</p>

      <h2>3. What we hold about you and why</h2>
      <table class="table">
        <tr><th>Data</th><th>Why we hold it</th><th>Where it goes</th></tr>
        <tr><td>GitHub id, login, display name</td><td>To identify your account when you sign in; sign-in reads your public profile</td><td>Display name and publisher name are shown as the publisher of your entries</td></tr>
        <tr><td>The GitHub organisations you are an active member of, read at each sign-in</td><td>To decide whether you may publish classes in an organisation's name</td><td>Nowhere; replaced at your next sign-in and removed with your account</td></tr>
        <tr><td>GitHub token (encrypted)</td><td>To check, when you publish, that you can push to the repository and that its release holds the package, and to read the release when someone asks for a download link</td><td>Sent only to api.github.com</td></tr>
        <tr><td>Recipes, components and classes you publish (name, version, description, questions, suitability and migration declarations, package foundations, diagram, repository and release names, digests), and the images you upload for them</td><td>To list them in the catalogue, let people search them, and serve their packages from your GitHub release with your token</td><td>Public to anyone, with your display name and publisher name; a version stays bound to its digest after it is unlisted; after you delete your account they stay public without your name (section 7)</td></tr>
        <tr><td>Build reports the catalogue's curators publish about a recipe: the agent, model and harness, the prompt and the answers given, the measured times, tool calls, tokens and cost, what was built, tested and run, problems and a rating</td><td>To show on the recipe's page how agents fared building from it</td><td>Public to anyone, with the recipe</td></tr>
        <tr><td>API keys (hashed), sessions (hashed)</td><td>To let you and your agents act on your account</td><td>Nowhere; we hold hashes only</td></tr>
        <tr><td>Audit log (event, short detail, country of the request)</td><td>So you can see what happened on your account</td><td>Shown only to you</td></tr>
      </table>
      <p>We do not sell, share or analyse this information for any purpose other than running the service for you. No advertising, no analytics, no tracking. Level N Ltd staff do not read your token; it is encrypted with a key that exists only in the service's secret store, and the service decrypts it only at the moment it is needed.</p>

      <h2>4. What we hold about people who read the catalogue</h2>
      <p>Pages set no tracking cookies and carry no analytics. When anyone asks for a recipe or component download link, the service keeps a hash of their network address, mixed with the day and a secret, until the end of that day (UTC); it is deleted within the following hour. The hash counts one download per address and limits how many links one address can ask for. The address itself is not stored.</p>

      <h2>5. Your responsibilities</h2>
      <ul class="bullets">
        <li>Publish a recipe, component or class only if you have the right to, describe it honestly, and put references to secrets in it, never secret values.</li>
        <li>Anything you publish is public until you unlist it, and stays public after you delete your account unless you unlist it first. You can mark your own recipe or component deprecated, with a replacement if you name one, and clear that mark again.</li>
        <li>Keep your GitHub account secure; the service can only be as safe as the sign-in in front of it.</li>
        <li>Do not use the service to publish anything unlawful, deceptive or harmful.</li>
      </ul>

      <h2>6. Keeping it secure</h2>
      <p>The GitHub token is encrypted per account with a key derived from a secret that lives only in the service's secret store; API keys and sessions are stored as keyed hashes; changing the token requires a browser session; API keys have scopes and expiry; every security event is logged and shown to you. The details are in the <a href="/guide#security">guide</a>. If we learn of a breach affecting your data we will tell you through the email on your GitHub account without undue delay and say what was affected and what we did.</p>

      <h2>7. Removing your data</h2>
      <p>The GitHub token can be removed on the developer page. Unlisting a recipe or component hides it from the catalogue. Deleting your account (developer page, Account) removes everything we hold about you at once, except the recipes, components and classes you published: those stay in the catalogue without your name, are marked orphaned, and carry a warning on every page and response that shows them or anything that uses them. Their packages can still be downloaded only while the release in your GitHub repository is public. Unlist them before deleting your account if you want them hidden.</p>

      <h2>8. The service itself</h2>
      <p>ClodHub is provided free and as is. We aim to keep it running and to give notice before any withdrawal, but we make no promise of availability and accept no liability for loss arising from its use, to the extent the law allows. We may change these terms; when we do, you are asked to accept the current version the next time you sign in, and the version you accepted is shown on the developer page.</p>

      <h2>9. Contact</h2>
      <p>Level N Ltd. Questions about these terms or about your data: use the contact details on <a href="https://www.level-n.com" target="_blank" rel="noopener">level-n.com</a>. Security problems: report them privately at <a href="https://github.com/clodhub/clodhub/security/advisories/new" target="_blank" rel="noopener">github.com/clodhub/clodhub/security</a>. Please do not post personal details or security problems in public issues.</p>
    </article>
  `;
}

export async function termsPage(root: HTMLElement): Promise<void> {
  setTheme("store", "Terms of use", true);
  const me = await whoAmI();
  const accepted = me?.developer.termsAcceptedVersion === TERMS_VERSION;
  mount(
    root,
    storeFrame(
      html`
        <div style="max-width:760px;margin:0 auto">
          ${me && !accepted ? acceptCard(me) : ""}
          ${termsBody()}
          ${me && accepted ? html`<p class="small muted mt">You accepted version ${me.developer.termsAcceptedVersion} on ${new Date(me.developer.termsAcceptedAt!).toLocaleString()}. <a href="/dev">Developer page</a></p>` : ""}
        </div>
      `,
      { me },
    ),
  );
  wireImages(root);
  wireAccept(root);
}

function acceptCard(me: Me): Raw {
  const changed = me.developer.termsAcceptedVersion !== null;
  return html`
    <div class="card pad-l mt" style="border-color:var(--accent)">
      <h2 style="margin-top:0">${changed ? "Accept the current terms" : "Before you start"}</h2>
      <p class="muted">${changed ? `You accepted version ${me.developer.termsAcceptedVersion}; version ${TERMS_VERSION} is current. Please read and accept it.` : "Read these terms once; they say what we hold about you and why. The developer page opens as soon as you accept."}</p>
      <label class="check mt"><input type="checkbox" id="agree" /> <span>I have read the terms and the data statement and I accept them.</span></label>
      <div class="form-actions"><button class="btn lg" id="accept" disabled>Accept and continue</button><form method="post" action="/api/auth/logout" style="display:inline"><button class="btn secondary" type="submit">Sign out instead</button></form></div>
      <div id="error" class="mt-s"></div>
    </div>
  `;
}

function wireAccept(root: HTMLElement): void {
  const box = root.querySelector<HTMLInputElement>("#agree");
  const btn = root.querySelector<HTMLButtonElement>("#accept");
  if (!box || !btn) return;
  box.onchange = () => (btn.disabled = !box.checked);
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await api("POST", "/api/dev/terms", { version: TERMS_VERSION });
      await whoAmI(true);
      toast("Thank you");
      navigate("/dev");
    } catch (err) {
      btn.disabled = false;
      root.querySelector("#error")!.innerHTML = callout("bad", html`<p>${err instanceof Error ? err.message : String(err)}</p>`).html;
    }
  };
}

export function termsPending(me: Me | null): boolean {
  return Boolean(me && me.authVia === "session" && me.developer.termsAcceptedVersion !== TERMS_VERSION);
}

export { icon };
