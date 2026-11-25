import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { handle } from "../src/index.js";
import { loadSecrets } from "../src/secrets.js";
import { TERMS_VERSION } from "@clodhub/shared";
import { BASE, GH_TOKEN, api, clearDb, fakeFetch, oauthRoutes, signIn, testDeps, testEnv } from "./helpers.js";

let env: Env;

beforeEach(async () => {
  env = testEnv();
  await clearDb(env);
});

describe("GitHub sign-in", () => {
  it("redirects to GitHub with a state cookie", async () => {
    const res = await handle(new Request(`${BASE}/api/auth/github`), env);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("Location")!);
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("test-client-id");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${BASE}/api/auth/callback`);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-ch_state=[0-9a-f]{32}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  });

  it("creates the developer on first sign-in and reuses it after", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect(cookie).toMatch(/^__Host-ch_session=[0-9a-f]{48}$/);
    const me = await handle(api(cookie, "GET", "/api/dev/me"), env, deps);
    expect(me.status).toBe(200);
    const body = (await me.json()) as { developer: { slug: string; displayName: string; githubLogin: string }; secrets: { github: boolean } };
    expect(body.developer).toMatchObject({ slug: "george", displayName: "George", githubLogin: "george" });
    expect(body.secrets).toEqual({ github: false, githubSavedAt: null });

    const again = await signIn(env, deps);
    const me2 = (await (await handle(api(again, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { id: string } };
    expect(me2.developer.id).toBe((body.developer as { id?: string }).id);
  });

  it("avoids reserved and taken slugs", async () => {
    const deps = testDeps();
    const a = await signIn(env, deps, { id: 1, login: "dev", name: "Dev" });
    const b = await signIn(env, deps, { id: 2, login: "dev", name: "Other" });
    const sa = (await (await handle(api(a, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { slug: string } };
    const sb = (await (await handle(api(b, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { slug: string } };
    expect(sa.developer.slug).toBe("dev-2");
    expect(sb.developer.slug).toBe("dev-3");
  });

  it("rejects a callback with a wrong state", async () => {
    const res = await handle(new Request(`${BASE}/api/auth/callback?code=abc&state=zzz`, { headers: { Cookie: "__Host-ch_state=other" } }), env, testDeps(fakeFetch(oauthRoutes()).fetch));
    expect(res.status).toBe(400);
  });

  it("requires a session for /api/dev and ends it on logout", async () => {
    const deps = testDeps();
    expect((await handle(api(null, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
    const cookie = await signIn(env, deps);
    const out = await handle(api(cookie, "POST", "/api/auth/logout"), env, deps);
    expect(out.status).toBe(302);
    expect(out.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    expect((await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
  });

  it("answers who is signed in without an error for a visitor", async () => {
    const deps = testDeps();
    const visitor = await handle(api(null, "GET", "/api/auth/session"), env, deps);
    expect(visitor.status).toBe(200);
    expect(await visitor.json()).toBeNull();
    const cookie = await signIn(env, deps);
    const signedIn = await handle(api(cookie, "GET", "/api/auth/session"), env, deps);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual(await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json());
    await handle(api(cookie, "POST", "/api/auth/logout"), env, deps);
    expect(await (await handle(api(cookie, "GET", "/api/auth/session"), env, deps)).json()).toBeNull();
  });

  it("expires sessions after 30 days", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    deps.advance(31 * 86_400_000);
    expect((await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
  });

  it("refuses sign-in politely while the GitHub app is not configured", async () => {
    const bare = testEnv({ GITHUB_OAUTH_CLIENT_ID: undefined, GITHUB_OAUTH_CLIENT_SECRET: undefined });
    for (const path of ["/api/auth/login", "/api/auth/github", "/api/auth/callback?code=a&state=b"]) {
      const res = await handle(new Request(`${BASE}${path}`), bare);
      expect(res.status, path).toBe(503);
      expect(((await res.json()) as { error: string }).error).toBe("GitHub sign-in is not available yet; reading the catalogue needs no sign-in");
    }
    expect(await (await handle(new Request(`${BASE}/api/health`), bare)).json()).toMatchObject({ oauth: false });
  });

  it("reports health without secrets", async () => {
    const res = await handle(new Request(`${BASE}/api/health`), env);
    expect(await res.json()).toEqual({ ok: true, oauth: true, links: true, secrets: true });
  });
});

describe("terms", () => {
  it("blocks the console until the current terms are accepted, but not /me or API keys", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps, undefined, false);
    const me = (await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json()) as { termsVersion: string; developer: { termsAcceptedVersion: string | null } };
    expect(me.termsVersion).toBe(TERMS_VERSION);
    expect(me.developer.termsAcceptedVersion).toBeNull();
    const blocked = await handle(api(cookie, "GET", "/api/dev/keys"), env, deps);
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/accept the terms/);
    expect((await handle(api(cookie, "POST", "/api/dev/terms", { version: "1999-01-01" }), env, deps)).status).toBe(400);
    const ok = await handle(api(cookie, "POST", "/api/dev/terms", { version: TERMS_VERSION }), env, deps);
    expect(((await ok.json()) as { termsAcceptedAt: string }).termsAcceptedAt).toBe("2026-10-16T10:00:00.000Z");
    expect((await handle(api(cookie, "GET", "/api/dev/keys"), env, deps)).status).toBe(200);
    const again = (await (await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).json()) as { developer: { termsAcceptedVersion: string } };
    expect(again.developer.termsAcceptedVersion).toBe(TERMS_VERSION);
    const log = (await (await handle(api(cookie, "GET", "/api/dev/audit"), env, deps)).json()) as { events: { event: string }[] };
    expect(log.events[0].event).toBe("terms-accepted");
  });

  it("deletes the account and everything under it", async () => {
    const deps = testDeps(fakeFetch(oauthRoutes()).fetch);
    const cookie = await signIn(env, deps);
    await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps);
    await handle(api(cookie, "POST", "/api/dev/keys", { name: "k" }), env, deps);
    expect((await handle(api(cookie, "DELETE", "/api/dev/me", { confirm: "wrong" }), env, deps)).status).toBe(400);
    const gone = await handle(api(cookie, "DELETE", "/api/dev/me", { confirm: "george" }), env, deps);
    expect(gone.status).toBe(200);
    expect(gone.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    for (const table of ["developers", "developer_secrets", "sessions", "api_keys", "audit_log"]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row!.n, table).toBe(0);
    }
    expect((await handle(api(cookie, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
  });
});

describe("account settings", () => {
  it("updates slug and display name with validation", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect((await handle(api(cookie, "PUT", "/api/dev/me", { slug: "API", displayName: "G" }), env, deps)).status).toBe(400);
    expect((await handle(api(cookie, "PUT", "/api/dev/me", { slug: "geo", displayName: " " }), env, deps)).status).toBe(400);
    const ok = await handle(api(cookie, "PUT", "/api/dev/me", { slug: "George Mc", displayName: "George M" }), env, deps);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { developer: { slug: string } }).developer.slug).toBe("george-mc");
    const other = await signIn(env, deps, { id: 7, login: "sue", name: "Sue" });
    expect((await handle(api(other, "PUT", "/api/dev/me", { slug: "george-mc", displayName: "Sue" }), env, deps)).status).toBe(409);
  });

  it("stores the GitHub token encrypted and never returns it", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect((await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: "not-a-token" }), env, deps)).status).toBe(400);
    const res = await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps);
    const saved = "2026-10-16T10:00:00.000Z";
    expect(await res.json()).toEqual({ secrets: { github: true, githubSavedAt: saved } });

    const row = await env.DB.prepare("SELECT blob FROM developer_secrets").first<{ blob: string }>();
    const envelope = JSON.parse(row!.blob) as { v: number; kid: string; fields: Record<string, { iv: string; ct: string }>; savedAt: Record<string, string> };
    expect(envelope.v).toBe(2);
    expect(envelope.kid).toMatch(/^[0-9a-f]{12}$/);
    expect(Object.keys(envelope.fields)).toEqual(["githubToken"]);
    expect(row!.blob).not.toContain(GH_TOKEN);

    // Sending the same token again neither moves its date nor logs a save.
    deps.advance(60_000);
    const again = (await (await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps)).json()) as { secrets: { githubSavedAt: string } };
    expect(again.secrets.githubSavedAt).toBe(saved);
    const events = (await (await handle(api(cookie, "GET", "/api/dev/audit"), env, deps)).json()) as { events: { event: string; detail: string }[] };
    expect(events.events.filter((e) => e.event === "credentials-saved")).toHaveLength(1);

    const cleared = await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: "-" }), env, deps);
    expect(await cleared.json()).toEqual({ secrets: { github: false, githubSavedAt: null } });
  });

  it("refuses credential changes through an API key", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const { key } = (await (await handle(api(cookie, "POST", "/api/dev/keys", { name: "k" }), env, deps)).json()) as { key: string };
    const res = await handle(api(null, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }, { Authorization: `Bearer ${key}` }), env, deps);
    expect(res.status).toBe(403);
  });

  it("rewraps credentials sealed under MASTER_KEY_PREVIOUS", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    expect((await handle(api(cookie, "PUT", "/api/dev/secrets", { githubToken: GH_TOKEN }), env, deps)).status).toBe(200);
    const before = (await env.DB.prepare("SELECT blob FROM developer_secrets").first<{ blob: string }>())!.blob;
    const rotated = testEnv({ MASTER_KEY: "brand-new-master-key", MASTER_KEY_PREVIOUS: env.MASTER_KEY });
    // The session itself survives rotation (hash under the previous key, rewritten on use).
    const me = (await (await handle(api(cookie, "GET", "/api/dev/me"), rotated, deps)).json()) as { secrets: { github: boolean } };
    expect(me.secrets).toMatchObject({ github: true });
    // Any decrypting read rewraps the blob under the new key.
    const { developer } = me as unknown as { developer: { id: string } };
    expect((await loadSecrets(rotated, developer.id)).githubToken).toBe(GH_TOKEN);
    const after = (await rotated.DB.prepare("SELECT blob FROM developer_secrets").first<{ blob: string }>())!.blob;
    expect(after).not.toBe(before);
    expect(JSON.parse(after).kid).not.toBe(JSON.parse(before).kid);
    const noPrevious = testEnv({ MASTER_KEY: "brand-new-master-key" });
    expect((await loadSecrets(noPrevious, developer.id)).githubToken).toBe(GH_TOKEN);
  });

  it("hashes session ids in the database and upgrades legacy rows", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const raw = cookie.split("=")[1];
    const rows = await env.DB.prepare("SELECT id FROM sessions").all<{ id: string }>();
    expect(rows.results.map((r) => r.id)).not.toContain(raw);
    expect(rows.results[0].id.startsWith("h2:")).toBe(true);

    await env.DB.prepare("INSERT INTO sessions (id, developer_id, expires_at) VALUES (?, (SELECT id FROM developers LIMIT 1), ?)").bind("legacyraw", "2030-01-01T00:00:00Z").run();
    expect((await handle(api("__Host-ch_session=legacyraw", "GET", "/api/dev/me"), env, deps)).status).toBe(200);
    const upgraded = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?").bind("legacyraw").first();
    expect(upgraded).toBeNull();
    expect((await handle(api("__Host-ch_session=legacyraw", "GET", "/api/dev/me"), env, deps)).status).toBe(200);
  });

  it("ignores session and state cookies without the __Host- prefix", async () => {
    const deps = testDeps();
    const cookie = await signIn(env, deps);
    const id = cookie.split("=")[1];
    // A subdomain can toss "ch_session=..." with Domain=clodhub.com; it must not authenticate.
    expect((await handle(api(`ch_session=${id}`, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
    const start = await handle(new Request(`${BASE}/api/auth/github`), env, deps);
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    const tossed = await handle(new Request(`${BASE}/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: `ch_state=${state}` } }), env, testDeps(fakeFetch(oauthRoutes()).fetch));
    expect(tossed.status).toBe(400);
  });

  it("signs out everywhere and records security events", async () => {
    const deps = testDeps();
    const a = await signIn(env, deps);
    const b = await signIn(env, deps);
    const out = await handle(api(a, "POST", "/api/auth/logout-everywhere"), env, deps);
    expect(await out.json()).toEqual({ ok: true, sessions: 2 });
    expect((await handle(api(b, "GET", "/api/dev/me"), env, deps)).status).toBe(401);
    const c = await signIn(env, deps);
    const log = (await (await handle(api(c, "GET", "/api/dev/audit"), env, deps)).json()) as { events: { event: string; detail: string }[] };
    expect(log.events.map((e) => e.event)).toEqual(["terms-accepted", "sign-in", "sign-out-everywhere", "terms-accepted", "sign-in", "terms-accepted", "sign-in"]);
    expect(log.events[2].detail).toBe("2 sessions");
  });
});

describe("response hygiene", () => {
  it("adds security headers to every response", async () => {
    const res = await handle(new Request(`${BASE}/api/health`), env);
    expect(res.headers.get("Strict-Transport-Security")).toMatch(/max-age=31536000/);
    expect(res.headers.get("Content-Security-Policy")).toMatch(/frame-ancestors 'none'/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const err = await handle(new Request(`${BASE}/api/nope`), env);
    expect(err.status).toBe(404);
    expect(err.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
