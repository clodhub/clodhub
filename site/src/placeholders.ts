// Generated artwork so a page with the bare minimum still looks finished.
import { escapeHtml, raw, type Raw } from "./html.js";

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function palette(seed: string): { a: string; b: string; c: string } {
  const h = hash(seed || "app") % 360;
  return { a: `hsl(${h} 78% 56%)`, b: `hsl(${(h + 42) % 360} 82% 46%)`, c: `hsl(${(h + 300) % 360} 70% 62%)` };
}

export function initials(name: string, max = 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, max).map((w) => w[0]!.toUpperCase()).join("");
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Square app icon: gradient tile, soft highlight, one big letter.
export function iconSvg(name: string): string {
  const { a, b } = palette(name);
  const letter = escapeHtml(initials(name, 1));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="h" cx="30%" cy="20%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#h)"/>
<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-weight="700" font-size="260" fill="#fff" fill-opacity=".95">${letter}</text>
</svg>`;
}

export function iconUrl(name: string): string {
  return svgDataUrl(iconSvg(name));
}

// Round avatar with initials.
export function avatarUrl(name: string): string {
  const { b, c } = palette(name);
  const text = escapeHtml(initials(name));
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<circle cx="64" cy="64" r="64" fill="url(#g)"/>
<text x="64" y="64" dy=".36em" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-weight="700" font-size="${text.length > 1 ? 50 : 60}" fill="#fff">${text}</text>
</svg>`);
}

