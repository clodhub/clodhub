import type { Deps, Env } from "./env.js";

// Fetch a release or release asset; GitHub API URLs get the developer's token when there is one.
export function fetchUpstream(env: Env, deps: Deps, url: string, githubToken: string | undefined, accept?: string): Promise<Response> {
  const headers = new Headers({ "User-Agent": "clodhub" });
  const host = new URL(url).host;
  if (host === "api.github.com") {
    if (githubToken) headers.set("Authorization", `Bearer ${githubToken}`);
    headers.set("Accept", accept ?? "application/octet-stream");
  } else if (accept) {
    headers.set("Accept", accept);
  }
  return deps.fetch(url, { headers, redirect: "follow" });
}
