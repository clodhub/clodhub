// Developer account routes: a browser session or an API key; requireSession marks the browser-only ones.
import { TERMS_VERSION } from "@clodhub/shared";
import { audit } from "../audit.js";
import { RESERVED_SLUGS, apiKeyHash, clearSessionCookie, newApiKey, normaliseSlug, requireSession, type AuthedDeveloper } from "../auth.js";
import { randomId } from "../crypto.js";
import { Db, type ApiKeyRow, type Developer, type DeveloperSecrets, type KeyScope } from "../db.js";
import type { Deps, Env } from "../env.js";
import { HttpError, json, readJson, text } from "../http.js";
import { EDITABLE_SECRET_FIELDS, loadSecrets, saveSecrets, secretsSummary } from "../secrets.js";

// What the dashboard may know about stored credentials: presence and save dates, never values.
function secretStatus(s: DeveloperSecrets) {
  return { github: Boolean(s.githubToken), githubSavedAt: s.githubToken ? s.savedAt?.githubToken ?? null : null };
}

// GET /api/dev/me
export async function me(env: Env, dev: AuthedDeveloper): Promise<Response> {
  const { authVia, scope, keyId: _k, ...developer } = dev;
  return json({ developer, authVia, scope, termsVersion: TERMS_VERSION, secrets: secretStatus(await secretsSummary(env, dev.id)) });
}

// POST /api/dev/terms - dashboard only; records acceptance of the current terms.
export async function acceptTerms(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const body = await readJson<{ version?: string }>(request);
  if (body.version !== TERMS_VERSION) throw new HttpError(400, `the current terms are version ${TERMS_VERSION}`);
  const now = deps.now().toISOString();
  await Db.from(env).acceptTerms(dev.id, TERMS_VERSION, now);
  await audit(request, env, deps, dev.id, "terms-accepted", TERMS_VERSION);
  return json({ ok: true, termsAcceptedVersion: TERMS_VERSION, termsAcceptedAt: now });
}

// DELETE /api/dev/me - dashboard only; the body must name the GitHub login to confirm.
export async function deleteAccount(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const body = await readJson<{ confirm?: string }>(request);
  if (body.confirm !== dev.githubLogin) throw new HttpError(400, "type your GitHub login to confirm");
  await Db.from(env).deleteDeveloper(dev.id, deps.now().toISOString());
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie(env) },
  });
}

// PUT /api/dev/me
export async function updateMe(request: Request, env: Env, dev: Developer): Promise<Response> {
  const body = await readJson<{ slug?: string; displayName?: string }>(request);
  const slug = normaliseSlug(text(body.slug, 40));
  const displayName = text(body.displayName, 80);
  if (slug === "" || RESERVED_SLUGS.has(slug)) throw new HttpError(400, "that page name is not available");
  if (displayName === "") throw new HttpError(400, "display name is required");
  const db = Db.from(env);
  const taken = await db.developerBySlug(slug);
  if (taken && taken.id !== dev.id) throw new HttpError(409, "that page name is taken");
  await db.updateDeveloper(dev.id, slug, displayName);
  return json({ developer: { ...dev, slug, displayName } });
}

// PUT /api/dev/secrets - dashboard only. Blank fields keep their current value; "-" clears one.
export async function updateSecrets(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const body = await readJson<Partial<DeveloperSecrets>>(request);
  const current = await loadSecrets(env, dev.id);
  const next: DeveloperSecrets = { ...current, savedAt: { ...current.savedAt } };
  const now = deps.now().toISOString();
  const saved: string[] = [];
  const removed: string[] = [];
  for (const key of EDITABLE_SECRET_FIELDS) {
    const value = body[key];
    // Blank keeps the saved value; so does the same value again.
    if (typeof value !== "string" || value.trim() === "" || value.trim() === current[key]) continue;
    if (value.trim() === "-") {
      delete next[key];
      delete next.savedAt![key];
      removed.push(key);
    } else {
      next[key] = value.trim();
      next.savedAt![key] = now;
      saved.push(key);
    }
  }
  if (saved.includes("githubToken") && !/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(next.githubToken!)) {
    throw new HttpError(400, "that does not look like a GitHub token (expected github_pat_... or ghp_...)");
  }
  await saveSecrets(env, dev.id, next, deps.now());
  if (saved.length > 0) await audit(request, env, deps, dev.id, "credentials-saved", saved.join(", "));
  if (removed.length > 0) await audit(request, env, deps, dev.id, "credentials-removed", removed.join(", "));
  return json({ secrets: secretStatus(next) });
}

function publicKey(k: ApiKeyRow) {
  const { keyHash: _hash, ...rest } = k;
  return rest;
}

// GET /api/dev/keys
export async function listKeys(env: Env, dev: Developer): Promise<Response> {
  return json({ keys: (await Db.from(env).apiKeysByDeveloper(dev.id)).map(publicKey) });
}

const MAX_KEY_DAYS = 365;

// POST /api/dev/keys - dashboard only; the key is returned once.
export async function createKey(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const body = await readJson<{ name?: string; scope?: string; expiresInDays?: number | null }>(request);
  const scope: KeyScope = body.scope === "read" ? "read" : "manage";
  let expiresAt: string | null = null;
  if (body.expiresInDays !== null && body.expiresInDays !== undefined) {
    const days = Number(body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_KEY_DAYS) throw new HttpError(400, `expiresInDays must be between 1 and ${MAX_KEY_DAYS}, or null for no expiry`);
    expiresAt = new Date(deps.now().getTime() + days * 86_400_000).toISOString();
  }
  const key = newApiKey();
  const row: ApiKeyRow = {
    id: randomId(8),
    developerId: dev.id,
    name: text(body.name, 60) || "Agent",
    prefix: key.slice(0, 11),
    keyHash: await apiKeyHash(env, key),
    scope,
    createdAt: deps.now().toISOString(),
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  };
  await Db.from(env).insertApiKey(row);
  await audit(request, env, deps, dev.id, "api-key-created", `${row.name} (${scope}${expiresAt ? `, expires ${expiresAt.slice(0, 10)}` : ", no expiry"})`);
  return json({ key, apiKey: publicKey(row) }, 201);
}

// DELETE /api/dev/keys/:id - dashboard only.
export async function revokeKey(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper, id: string): Promise<Response> {
  requireSession(dev);
  const ok = await Db.from(env).revokeApiKey(id, dev.id, deps.now().toISOString());
  if (!ok) throw new HttpError(404, "unknown key");
  await audit(request, env, deps, dev.id, "api-key-revoked", id);
  return json({ ok: true });
}

// POST /api/dev/keys/revoke-all - dashboard only.
export async function revokeAllKeys(request: Request, env: Env, deps: Deps, dev: AuthedDeveloper): Promise<Response> {
  requireSession(dev);
  const count = await Db.from(env).revokeAllApiKeys(dev.id, deps.now().toISOString());
  await audit(request, env, deps, dev.id, "api-keys-revoked-all", `${count} key${count === 1 ? "" : "s"}`);
  return json({ ok: true, revoked: count });
}

// GET /api/dev/audit - recent security events for this developer.
export async function auditLog(env: Env, dev: Developer): Promise<Response> {
  return json({ events: await Db.from(env).auditFor(dev.id, 50) });
}
