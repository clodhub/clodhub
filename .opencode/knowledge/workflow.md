# Workflow

## Repo identity

`git -C clodhub remote -v` must show `github.com/clodhub/clodhub`. Never derive the repo from the folder name.
Push and run `gh` with `env -u GITHUB_TOKEN -u GH_TOKEN` so `gh` uses its keyring login.

## Branch model

- `main` is deployable. Deploy is manual from a clean `main`.
- Work on `feat/<topic>`, `fix/<topic>`, `chore/<topic>` branches. Commit small, one-line imperative subjects. No em dashes.
- Open PRs with `gh pr create --repo clodhub/clodhub --base main`; merge with `gh pr merge --merge`.
- Commits use the GitHub noreply address (repo-local `git config user.email`).
- Never merge a PR whose author is not `george-mcintyre`, except Dependabot's.

## Build and test

- `npm install` at the root (workspaces `shared`, `worker`, `site`).
- `npm test`, `npm run typecheck`, `npm run build` must pass before a PR.
- Local: `cd worker && npx wrangler d1 migrations apply clodhub --local`, then `npm run build && npm run dev -w worker` on http://localhost:8787. Local secrets in `worker/.dev.vars` (see `.dev.vars.example`).

## Deploy

Cloudflare account `b52958953fbf0bdaa10cacf0419a6fa0`; Worker `clodhub` on the custom domain `clodhub.com`; D1 `clodhub` (`52511f94-bc20-421a-846c-a0553f32e7f3`); R2 `clodhub-catalogue`; cron `7 * * * *`.

1. `npm run build` at the root.
2. `cd worker`; when a migration was added: `npx wrangler d1 migrations apply clodhub --remote`, then deploy at once (the running Worker may fail on catalogue routes in between).
3. `npx wrangler deploy`.
4. `npm run smoke` from the root.

Worker secrets: `LINK_SECRET`, `MASTER_KEY` (never readable back; losing it makes saved tokens undecryptable), `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` (GitHub OAuth app with callback `https://clodhub.com/api/auth/callback`). Set with `npx wrangler secret put <name>` reading the value from standard input; never put a value on a command line. `PUBLIC_ORIGIN` in `wrangler.jsonc` must equal the live origin.

## Live check

`npm run smoke` checks the public endpoints of https://clodhub.com: every document, every listed recipe and component against the size limits, and the read routes. With `CLODHUB_API_KEY` set to a manage key it also checks the developer routes, refusals for browser-only actions, and that every GET route agents.md lists was called. It changes nothing. `--base http://localhost:8787` for a local run.

## Schema changes

Add a new numbered file under `worker/migrations/`; never edit an applied one. Tests apply all migrations to a fresh D1 before each file runs.

## Exporting D1

`component_fts`, `recipe_fts` and their `fts5vocab` tables (`component_vocab`, `recipe_vocab`) are virtual tables.

- **To read or keep a copy:** `npx wrangler d1 export clodhub --remote --output dump.sql --compatibility sqlite3_cli_only` (wrangler 4.159.0 or newer). It opens with `sqlite3` but cannot be imported into D1.
- **To import into D1 again:** drop the four virtual tables, export without that flag, create them again (the `CREATE VIRTUAL TABLE` lines in `worker/migrations/0001_schema.sql`) and refill the full-text tables:

```
INSERT INTO component_fts (rowid, name, title, summary, class, tags)
  SELECT seq, name || ' ' || replace(slug, '-', ' '), COALESCE(class_title, ''), description,
         COALESCE(class_name || ' ' || COALESCE(class_title, ''), ''), tags FROM components WHERE latest_version IS NOT NULL;
INSERT INTO recipe_fts (rowid, name, title, summary, class, tags)
  SELECT seq, name || ' ' || replace(slug, '-', ' '), title, summary, '', tags FROM recipes WHERE latest_version IS NOT NULL;
```
