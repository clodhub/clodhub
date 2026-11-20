// R2 holds what the listing tables leave out: each published version's full entry (a document that never changes)
// and the images by sha256.
import type { ComponentEntry, RecipeEntry } from "@my/store-shared";
import type { Env } from "./env.js";
import { HttpError } from "./http.js";

export type Document<K> = K extends "component" ? ComponentEntry : RecipeEntry;

// Stores a version's entry under the sha256 of its text, so a key always names the same bytes; returns the key.
export async function putDocument(env: Env, kind: "recipe" | "component", slug: string, version: string, entry: ComponentEntry | RecipeEntry): Promise<string> {
  const body = JSON.stringify(entry);
  const key = `documents/${kind}/${slug}/${version}/${await sha256Hex(new TextEncoder().encode(body))}.json`;
  await env.CATALOGUE.put(key, body, { httpMetadata: { contentType: "application/json" } });
  return key;
}

// A document is written once, so a copy in the Cache API is never stale.
export async function readDocument<T extends ComponentEntry | RecipeEntry>(env: Env, key: string): Promise<T> {
  const cacheKey = new Request(`${env.PUBLIC_ORIGIN}/__cache/${key}`);
  const cache = typeof caches === "undefined" ? null : await caches.open("catalogue-documents");
  const hit = await cache?.match(cacheKey);
  if (hit) return (await hit.json()) as T;
  const object = await env.CATALOGUE.get(key);
  if (!object) throw new HttpError(500, "a published version's document is missing");
  const body = await object.text();
  await cache?.put(cacheKey, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=31536000, immutable" } }));
  return JSON.parse(body) as T;
}

export async function readDocuments<T extends ComponentEntry | RecipeEntry>(env: Env, keys: (string | null)[]): Promise<(T | null)[]> {
  return Promise.all(keys.map((k) => (k ? readDocument<T>(env, k) : Promise.resolve(null))));
}

// ---------------------------------------------------------------- images

export const imageKey = (hex: string): string => `images/${hex}`;

export interface ImageFacts {
  type: "png" | "webp";
  width: number;
  height: number;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ascii = (bytes: Uint8Array, at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));

// A PNG whose chunks all carry correct CRCs, from IHDR through IEND at the end of the file, with at least one IDAT.
function pngFacts(bytes: Uint8Array): ImageFacts | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 57 || ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return null;
  let at = 8;
  let first = true;
  let idat = false;
  let size: { width: number; height: number } | null = null;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    const end = at + 12 + length;
    if (length > 0x7fffffff || end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length)) return null;
    if (first) {
      if (type !== "IHDR" || length !== 13) return null;
      size = { width: view.getUint32(at + 8), height: view.getUint32(at + 12) };
      first = false;
    } else if (type === "IHDR") return null;
    if (type === "IDAT") idat = true;
    if (type === "IEND") return length === 0 && end === bytes.length && idat && size ? { type: "png", ...size } : null;
    at = end;
  }
  return null;
}

// A WebP whose RIFF size is the file's, whose chunks fill it exactly, and which holds one complete still image
// (a VP8 or VP8L chunk). Animations are refused.
function webpFacts(bytes: Uint8Array): ImageFacts | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP" || view.getUint32(4, true) + 8 !== bytes.length) return null;
  let at = 12;
  let size: { width: number; height: number } | null = null;
  let image = false;
  let extended: { width: number; height: number } | null = null;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) return null;
    const type = ascii(bytes, at, 4);
    const length = view.getUint32(at + 4, true);
    const end = at + 8 + length + (length % 2);
    if (end > bytes.length) return null;
    const data = at + 8;
    if (type === "ANIM" || type === "ANMF") return null;
    if (type === "VP8X" && at === 12 && length >= 10) extended = { width: 1 + (bytes[data + 4]! | (bytes[data + 5]! << 8) | (bytes[data + 6]! << 16)), height: 1 + (bytes[data + 7]! | (bytes[data + 8]! << 8) | (bytes[data + 9]! << 16)) };
    if (type === "VP8L" && !image) {
      if (length < 5 || bytes[data] !== 0x2f) return null;
      const b = view.getUint32(data + 1, true);
      size = { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
      image = true;
    } else if (type === "VP8 " && !image) {
      if (length < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
      size = { width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff };
      image = true;
    }
    at = end;
  }
  if (at !== bytes.length || !image || !size) return null;
  if (extended && (extended.width !== size.width || extended.height !== size.height)) return null;
  return { type: "webp", ...size };
}

// The type and size of a structurally complete PNG or WebP; null for anything else.
export function imageFacts(bytes: Uint8Array): ImageFacts | null {
  return pngFacts(bytes) ?? webpFacts(bytes);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
