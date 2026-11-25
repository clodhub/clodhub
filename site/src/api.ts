// Calls to the worker on the same origin.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `request failed (${res.status})`);
  return data;
}

export interface SecretStatus {
  github: boolean;
  githubSavedAt: string | null;
}

export interface Me {
  developer: { id: string; slug: string; displayName: string; githubLogin: string; createdAt: string; termsAcceptedVersion: string | null; termsAcceptedAt: string | null };
  authVia: "session" | "key";
  scope: "read" | "manage";
  termsVersion: string;
  secrets: SecretStatus;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "manage";
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface AuditEvent {
  id: number;
  event: string;
  detail: string;
  country: string | null;
  createdAt: string;
}

// Cached for the page lifetime so public pages can show who is signed in without a second round trip.
let mePromise: Promise<Me | null> | null = null;
export function whoAmI(force = false): Promise<Me | null> {
  if (!mePromise || force) {
    mePromise = api<Me | null>("GET", "/api/auth/session").catch(() => null);
  }
  return mePromise;
}
