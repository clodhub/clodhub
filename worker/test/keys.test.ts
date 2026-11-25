import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";
import { errorResponse, handle } from "../src/index.js";
import { BASE, api, clearDb, signIn, testDeps, testEnv, type TestDeps } from "./helpers.js";

let env: Env;
let deps: TestDeps;
let cookie: string;

beforeEach(async () => {
  env = testEnv();
  await clearDb(env);
  deps = testDeps();
  cookie = await signIn(env, deps);
});

const rename = (slug: string) => ({ slug, displayName: "George" });

describe("API keys", () => {
  it("creates a key from the dashboard and accepts it as a bearer", async () => {
    const res = await handle(api(cookie, "POST", "/api/dev/keys", { name: "My agent" }), env, deps);
    expect(res.status).toBe(201);
    const { key, apiKey } = (await res.json()) as { key: string; apiKey: { id: string; prefix: string; name: string; keyHash?: string } };
    expect(key).toMatch(/^ch_[0-9a-f]{40}$/);
    expect(apiKey).toMatchObject({ name: "My agent", prefix: key.slice(0, 11) });
    expect(apiKey.keyHash).toBeUndefined();

    const me = await handle(api(null, "GET", "/api/dev/me", undefined, { Authorization: `Bearer ${key}` }), env, deps);
    expect(me.status).toBe(200);
    expect(((await me.json()) as { authVia: string }).authVia).toBe("key");
    expect((await handle(api(null, "PUT", "/api/dev/me", rename("agent-set"), { Authorization: `Bearer ${key}` }), env, deps)).status).toBe(200);

    const list = (await (await handle(api(cookie, "GET", "/api/dev/keys"), env, deps)).json()) as { keys: { id: string; lastUsedAt: string | null }[] };
    expect(list.keys).toHaveLength(1);
    expect(list.keys[0].lastUsedAt).not.toBeNull();

    expect((await handle(api(null, "POST", "/api/dev/keys", { name: "x" }, { Authorization: `Bearer ${key}` }), env, deps)).status).toBe(403);
    expect((await handle(api(null, "DELETE", `/api/dev/keys/${apiKey.id}`, undefined, { Authorization: `Bearer ${key}` }), env, deps)).status).toBe(403);

    expect((await handle(api(cookie, "DELETE", `/api/dev/keys/${apiKey.id}`), env, deps)).status).toBe(200);
    expect((await handle(api(null, "GET", "/api/dev/me", undefined, { Authorization: `Bearer ${key}` }), env, deps)).status).toBe(401);
    expect((await handle(api(null, "GET", "/api/dev/me", undefined, { Authorization: "Bearer ch_nope" }), env, deps)).status).toBe(401);
  });

  it("keys are scoped to their developer", async () => {
    const other = await signIn(env, deps, { id: 9, login: "sue", name: "Sue" });
    const { key } = (await (await handle(api(other, "POST", "/api/dev/keys", {}), env, deps)).json()) as { key: string };
    const me = (await (await handle(api(null, "GET", "/api/dev/me", undefined, { Authorization: `Bearer ${key}` }), env, deps)).json()) as { developer: { githubLogin: string } };
    expect(me.developer.githubLogin).toBe("sue");
    expect(((await (await handle(api(cookie, "GET", "/api/dev/keys"), env, deps)).json()) as { keys: unknown[] }).keys).toHaveLength(0);
  });

  it("refuses cookie writes from another origin", async () => {
    expect((await handle(api(cookie, "PUT", "/api/dev/me", rename("x1"), { Origin: "https://evil.example" }), env, deps)).status).toBe(403);
    expect((await handle(api(cookie, "PUT", "/api/dev/me", rename("x1"), { Origin: env.PUBLIC_ORIGIN }), env, deps)).status).toBe(200);
  });

  it("hides internal detail of unexpected errors", async () => {
    const generic = errorResponse(new Request(`${BASE}/x`, { headers: { "cf-ray": "abc123" } }), new Error("D1_ERROR: no such table: secrets at offset 14"));
    expect(generic.status).toBe(500);
    expect(await generic.text()).toBe(JSON.stringify({ error: "something went wrong (reference abc123)" }));
  });
});

describe("token hardening", () => {
  it("stores keyed hashes and upgrades legacy plain hashes on use", async () => {
    const { key, apiKey } = (await (await handle(api(cookie, "POST", "/api/dev/keys", { name: "k" }), env, deps)).json()) as { key: string; apiKey: { id: string } };
    const keyPlain = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))), (b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("UPDATE api_keys SET key_hash = ? WHERE id = ?").bind(keyPlain, apiKey.id).run();
    expect((await handle(api(null, "GET", "/api/dev/me", undefined, { Authorization: `Bearer ${key}` }), env, deps)).status).toBe(200);
    const stored = await env.DB.prepare("SELECT key_hash AS h FROM api_keys WHERE id = ?").bind(apiKey.id).first<{ h: string }>();
    expect(stored!.h.startsWith("h2:")).toBe(true);
    expect(stored!.h).not.toContain(keyPlain);
  });

  it("enforces key scope and expiry", async () => {
    const ro = (await (await handle(api(cookie, "POST", "/api/dev/keys", { name: "reader", scope: "read", expiresInDays: 1 }), env, deps)).json()) as { key: string; apiKey: { scope: string; expiresAt: string } };
    expect(ro.apiKey.scope).toBe("read");
    expect(ro.apiKey.expiresAt).toBe("2026-10-17T10:00:00.000Z");
    const auth = { Authorization: `Bearer ${ro.key}` };
    expect((await handle(api(null, "GET", "/api/dev/components", undefined, auth), env, deps)).status).toBe(200);
    const denied = await handle(api(null, "PUT", "/api/dev/me", rename("reader"), auth), env, deps);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { error: string }).error).toMatch(/read-only/);
    expect((await handle(api(null, "POST", "/api/dev/components", {}, auth), env, deps)).status).toBe(403);
    deps.advance(2 * 86_400_000);
    expect((await handle(api(null, "GET", "/api/dev/components", undefined, auth), env, deps)).status).toBe(401);
    expect((await handle(api(cookie, "POST", "/api/dev/keys", { name: "bad", expiresInDays: 0 }), env, deps)).status).toBe(400);
    expect((await handle(api(cookie, "POST", "/api/dev/keys", { name: "bad", expiresInDays: 999 }), env, deps)).status).toBe(400);
  });

  it("revokes every key at once and logs it", async () => {
    const a = (await (await handle(api(cookie, "POST", "/api/dev/keys", { name: "a" }), env, deps)).json()) as { key: string };
    const b = (await (await handle(api(cookie, "POST", "/api/dev/keys", { name: "b" }), env, deps)).json()) as { key: string };
    expect(await (await handle(api(cookie, "POST", "/api/dev/keys/revoke-all"), env, deps)).json()).toEqual({ ok: true, revoked: 2 });
    expect((await handle(api(null, "GET", "/api/dev/me", undefined, { Authorization: `Bearer ${a.key}` }), env, deps)).status).toBe(401);
    expect((await handle(api(null, "GET", "/api/dev/me", undefined, { Authorization: `Bearer ${b.key}` }), env, deps)).status).toBe(401);
    const log = (await (await handle(api(cookie, "GET", "/api/dev/audit"), env, deps)).json()) as { events: { event: string; detail: string }[] };
    expect(log.events[0]).toMatchObject({ event: "api-keys-revoked-all", detail: "2 keys" });
    expect(log.events.some((e) => e.event === "api-key-created" && e.detail.startsWith("a (manage"))).toBe(true);
  });
});
