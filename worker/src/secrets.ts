// Read and write a developer's encrypted credentials, one ciphertext per field.
import { SECRET_FORMAT, keyId, openField, sealField, type Sealed } from "./crypto.js";
import { Db, type DeveloperSecrets } from "./db.js";
import type { Env } from "./env.js";
import { HttpError } from "./http.js";

export const SECRET_FIELDS = ["githubToken"] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];
export const EDITABLE_SECRET_FIELDS = SECRET_FIELDS;

interface Envelope {
  v: number;
  kid: string;
  fields: Partial<Record<SecretField, Sealed>>;
  savedAt: Partial<Record<SecretField, string>>;
}

function masterKeys(env: Env): { current: string; previous: string | null } {
  if (!env.MASTER_KEY) throw new HttpError(503, "MASTER_KEY is not configured");
  return { current: env.MASTER_KEY, previous: env.MASTER_KEY_PREVIOUS || null };
}

// Pick the master key that produced a ciphertext; null when neither configured key matches.
async function keyFor(env: Env, kid: string): Promise<string | null> {
  const { current, previous } = masterKeys(env);
  if ((await keyId(current)) === kid) return current;
  if (previous && (await keyId(previous)) === kid) return previous;
  return null;
}

function parse(blob: string): Envelope {
  const envelope = JSON.parse(blob) as Envelope;
  if (envelope.v !== SECRET_FORMAT) throw new HttpError(500, `unknown credential format ${envelope.v}`);
  return envelope;
}

// Decrypt only the requested fields; an envelope under the previous key is rewrapped under the current key.
export async function loadSecrets(env: Env, developerId: string, only?: readonly SecretField[], rewrapStale = true): Promise<DeveloperSecrets> {
  const blob = await Db.from(env).secretsBlob(developerId);
  if (!blob) return {};
  const envelope = parse(blob);
  const key = await keyFor(env, envelope.kid);
  if (!key) throw new HttpError(500, "stored credentials were sealed with a master key that is no longer configured");
  const out: DeveloperSecrets = { savedAt: envelope.savedAt };
  for (const f of only ?? SECRET_FIELDS) {
    const sealed = envelope.fields[f];
    if (sealed) out[f] = await openField(key, developerId, f, sealed);
  }
  if (key !== masterKeys(env).current && rewrapStale) await rewrap(env, developerId, envelope, key);
  return out;
}

// Presence and dates without decrypting anything.
export async function secretsSummary(env: Env, developerId: string): Promise<DeveloperSecrets> {
  const blob = await Db.from(env).secretsBlob(developerId);
  if (!blob) return {};
  const envelope = parse(blob);
  const out: DeveloperSecrets = { savedAt: envelope.savedAt };
  for (const f of SECRET_FIELDS) if (envelope.fields[f]) out[f] = "set";
  return out;
}

async function rewrap(env: Env, developerId: string, envelope: Envelope, oldKey: string): Promise<void> {
  const { current } = masterKeys(env);
  const fields: Envelope["fields"] = {};
  for (const f of SECRET_FIELDS) {
    const sealed = envelope.fields[f];
    if (sealed) fields[f] = await sealField(current, developerId, f, await openField(oldKey, developerId, f, sealed));
  }
  const next: Envelope = { v: SECRET_FORMAT, kid: await keyId(current), fields, savedAt: envelope.savedAt };
  await Db.from(env).putSecretsBlob(developerId, JSON.stringify(next), new Date().toISOString());
}

export async function saveSecrets(env: Env, developerId: string, secrets: DeveloperSecrets, now: Date): Promise<void> {
  const { current } = masterKeys(env);
  const fields: Envelope["fields"] = {};
  for (const f of SECRET_FIELDS) if (secrets[f]) fields[f] = await sealField(current, developerId, f, secrets[f]!);
  const envelope: Envelope = { v: SECRET_FORMAT, kid: await keyId(current), fields, savedAt: secrets.savedAt ?? {} };
  await Db.from(env).putSecretsBlob(developerId, JSON.stringify(envelope), now.toISOString());
}
