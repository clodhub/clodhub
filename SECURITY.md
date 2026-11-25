# Security

How ClodHub protects developer credentials and tokens, what to do on rotation, and what the design
does not cover. The catalogue holds entries and release pointers only, never packages or secret
values.

## What is stored and how

| data | at rest | notes |
|---|---|---|
| GitHub token | AES-256-GCM | key derived per developer with HKDF-SHA256 from `MASTER_KEY`; developer id, field name and format version bound as additional authenticated data; random 96-bit nonce per write |
| API keys (`ch_` + 160 random bits) | HMAC-SHA256 keyed hash (`h2:` prefix) | pepper derived from `MASTER_KEY`; only an 11-character prefix is kept for display |
| Session ids (192 random bits) | HMAC-SHA256 keyed hash | cookie `__Host-ch_session`, `HttpOnly; Secure; SameSite=Lax`, 30 days, purpose string `session` |
| Signed bundle links | HMAC-SHA256 over the payload with `LINK_SECRET` | expire after one hour |
| Recipes, components and classes (entry, page text, diagram, release pointer, digests) | plain, in D1 and R2 | public by design; never holds a package, token or secret value |
| Download address hashes | SHA-256 of day, address and `LINK_SECRET` | deleted in the first hourly run after their day ends |
| Audit log | plain text | event name, short detail, country; never values |

`MASTER_KEY` and `LINK_SECRET` live only in Cloudflare Worker secrets. A copy of the database
yields no plaintext token, no usable API key or session, and no way to forge one.

## Access rules

- The GitHub token can be written only from a browser session (`PUT /api/dev/secrets` refuses API
  keys). It is never returned by any endpoint; the developer page sees presence and save date.
  It must match the `github_pat_`, `ghp_` or `gho_` shape.
- Cookie sessions refuse state-changing requests whose `Origin` is not this site.
- API keys have a scope (`read` or `manage`) and an optional expiry of at most one year. Keys
  cannot create or revoke keys, delete the account or sign out sessions. Every key is revocable
  alone or all at once.
- The token is decrypted only while publishing, checking class scope membership, or making and
  serving a bundle link.
- Security events (sign-in, sign-out, token saves and removals, key creation and revocation,
  publishing, unlisting and deprecation) are written to the audit log and shown on the developer
  page, with "Sign out everywhere" next to them.
- Every response carries HSTS (preload), a strict Content Security Policy, `nosniff`,
  `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, a Referrer-Policy and a
  Permissions-Policy.

## The catalogue

- Reads are public and carry no developer credentials. Responses name the publisher by display
  name and publisher name only, or by nothing once the publisher deleted their account.
- Publishing needs a browser session with the current terms accepted, or a `manage` API key. The
  service checks with the publisher's saved GitHub token that they can push to the named
  repository and that the tagged release holds the named asset; a name's scope must equal the
  repository owner, and a name stays with its first developer and repository. Class scopes need
  membership of the GitHub organisation, read at sign-in with `read:org`.
- Only `CATALOGUE_CURATORS` (numeric GitHub ids) may set quality, publish build reports or the
  category tree.
- A version is bound to its digest. Unlisting hides a version and keeps its digest.
- Deleting an account removes the developer record, token, sessions and keys; recipes and
  components keep their rows with a null owner, flagged `owner-deleted` (orphaned), and nobody can
  change, unlist or republish them.
- An orphaned bundle is fetched with no GitHub token: a public release downloads, a private one
  answers `bundle-unavailable`.
- Entries that contain a private key block, a GitHub token, an API key or an AWS access key
  identifier are refused.
- A diagram is an SVG without scripts, event handlers, embedded objects, doctype declarations
  or references outside the file. It is served as an image with a sandboxing Content Security
  Policy and is shown through `<img>`.
- Bundles are fetched server-side and handed out through the signed one-hour `/dl/` link; the
  release asset's address and the token are never returned. A link request fails if GitHub's
  digest for the asset differs from the recorded one.
- Search terms are quoted word by word before they reach the full-text index.
- Limits: 50 recipes and 200 components per developer, 200 versions per name, 60 bundle links a
  minute per address, 300 image uploads a day per developer.

## Rotating the master key

1. Generate a new value: `openssl rand -hex 32`.
2. `npx wrangler secret put MASTER_KEY_PREVIOUS` with the current value, then
   `npx wrangler secret put MASTER_KEY` with the new one, both from `worker/`.
3. Tokens are rewrapped under the new key the first time they are read; API keys and sessions are
   rehashed the first time they are used.
4. When `SELECT json_extract(blob, '$.kid') AS kid, count(*) FROM developer_secrets GROUP BY kid`
   shows only the new key id, run `npx wrangler secret delete MASTER_KEY_PREVIOUS`.

Rotating `LINK_SECRET` only invalidates bundle links that are less than an hour old.

## If a credential leaks

- GitHub token: revoke it on GitHub, create a new one, save it on the developer page.
- API key: revoke it on the developer page (or revoke all).
- Suspected account takeover: Sign out everywhere and Revoke all keys on the developer page, then
  replace the GitHub token.

## Not covered

- Compromise of the Cloudflare account or of GitHub sign-in itself.
- Secrets in Worker memory during a request; the runtime does not offer zeroisation.
- Brute force against sign-in is bounded by GitHub; against API keys it is bounded by 160 bits.

## Reporting a vulnerability

Report it privately at https://github.com/clodhub/clodhub/security/advisories/new
(GitHub's private vulnerability reporting: only the maintainer sees it). Do not open a public
issue for a security problem, and do not include real secrets or personal data in any report.
