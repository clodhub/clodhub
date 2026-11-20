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

// The type and size of a PNG or WebP from its header; null for anything else.
export function imageFacts(bytes: Uint8Array): ImageFacts | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") return { type: "png", width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") return { type: "webp", width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)), height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) };
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const b = view.getUint32(21, true);
      return { type: "webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { type: "webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
