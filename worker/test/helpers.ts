import { TERMS_VERSION } from "@clodhub/shared";
import { env as bindings } from "cloudflare:workers";
import { expect } from "vitest";
import type { Deps, Env } from "../src/env.js";
import { handle } from "../src/index.js";

export const BASE = "https://clodhub.com";

export type Call = { method: string; url: string; body?: string; headers: Headers };

// A fetch stub keyed by "METHOD host/path"; records every call.
export function fakeFetch(routes: Record<string, (call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const call: Call = { method: req.method, url: req.url, body: req.method === "GET" ? undefined : await req.text(), headers: req.headers };
    calls.push(call);
    const key = `${req.method} ${u.host}${u.pathname}`;
    const handler = routes[key];
    if (!handler) return new Response(`no stub for ${key}`, { status: 599 });
    return handler(call);
  };
  return { fetch: fetchStub, calls };
}

export type TestDeps = Deps & { advance: (ms: number) => void };

export function testDeps(fetchStub: typeof fetch = () => Promise.resolve(new Response("no fetch", { status: 599 }))): TestDeps {
  let t = Date.parse("2026-10-16T10:00:00Z");
  return {
    fetch: fetchStub,
    now: () => new Date(t),
    sleep: async (ms) => {
      t += ms;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...(bindings as unknown as Env), ...overrides };
}

export async function clearDb(env: Env): Promise<void> {
  for (const table of ["build_reports", "published_digests", "developer_orgs", "image_uploaders", "listing_totals", "rate_limits", "downloads_seen", "job_progress", "component_fts", "recipe_fts", "downloads_daily", "version_purls", "purls", "advisories", "images", "class_versions", "classes", "recipes", "components", "categories", "audit_log", "api_keys", "sessions", "developer_secrets", "developers"]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
}

export const gh = (path: string) => `api.github.com${path}`;

export const jsonRes = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Routes that let a GitHub sign-in complete for one user.
export function oauthRoutes(user = { id: 42, login: "george", name: "George" }, orgs: string[] = []) {
  return {
    "POST github.com/login/oauth/access_token": () => jsonRes({ access_token: "gho_test" }),
    [`GET ${gh("/user")}`]: () => jsonRes(user),
    [`GET ${gh("/user/memberships/orgs")}`]: () => jsonRes(orgs.map((login) => ({ state: "active", organization: { login } }))),
  };
}

// Sign in through the stubbed OAuth flow; returns the Cookie header to use.
export async function signIn(env: Env, deps: TestDeps, user?: { id: number; login: string; name: string }, acceptTerms = true, orgs: string[] = []): Promise<string> {
  const stub = fakeFetch(oauthRoutes(user, orgs));
  const start = await handle(new Request(`${BASE}/api/auth/github`), env, deps);
  expect(start.status).toBe(302);
  const stateCookie = start.headers.get("Set-Cookie")!.split(";")[0];
  const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
  const done = await handle(new Request(`${BASE}/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: stateCookie } }), env, { ...deps, fetch: stub.fetch });
  expect(done.status).toBe(302);
  expect(done.headers.get("Location")).toBe(`${BASE}/dev`);
  const cookie = done.headers.get("Set-Cookie")!.split(";")[0];
  if (acceptTerms) {
    const accepted = await handle(api(cookie, "POST", "/api/dev/terms", { version: TERMS_VERSION }), env, deps);
    expect(accepted.status).toBe(200);
  }
  return cookie;
}

export function api(cookie: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { ...extra };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

export const GH_TOKEN = "ghp_" + "a".repeat(36);
