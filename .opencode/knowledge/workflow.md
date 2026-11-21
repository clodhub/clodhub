# Workflow

## Repo identity

`git -C ourapps remote -v` must show `github.com/ourapps-ae/ourapps`.
Never derive the repo from the folder name.

## Branch model

- `main` is deployable. Deploy is manual: `wrangler deploy` from a clean `main`.
- Work on `feat/<topic>`, `fix/<topic>`, `chore/<topic>` branches. One feature per PR.
- Commit small and often, imperative subject, one line. No em dashes anywhere.
- Open PRs with `gh pr create --repo ourapps-ae/ourapps --base main`.
- Merge with `gh pr merge --merge` (keep the small commits).

## Public repository rules

- The repository is public for reading; all rights reserved (`LICENSE`). Never merge a PR whose
  author is not `george-mcintyre`, except Dependabot's dependency updates; close outside PRs
  with a pointer to `CONTRIBUTING.md`.
- Commits here use the GitHub noreply address (repo-local `git config user.email`); never commit
  with a personal address.
- Security reports arrive through private vulnerability reporting (Security tab), not issues.
  Secret scanning, push protection, Dependabot and CodeQL default setup are on; check the
  Security tab after merges.
- Bumping `TERMS_VERSION` (`shared/src/terms.ts`) is required for any change to the terms text.

## Before a PR

- `npm run typecheck` and `npm test` green at the root.
- `npm run build -w site` succeeds.
- No secrets in tree. Worker secrets: `LINK_SECRET`, `MASTER_KEY`,
  `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` via `npx wrangler secret put`.
  Developer credentials (Apple key, GitHub token) are entered in the dashboard, never in config.

## Live check

`npm run smoke` checks the public endpoints of https://ourapps.app; with `OURAPPS_API_KEY` set to a
manage key it walks every endpoint agents.md lists on a throwaway app, compares the answers with
the documented shapes, and deletes what it made (`scripts/smoke.mjs`; `--base
http://localhost:8787` for a local run). It fails when agents.md lists an endpoint it did not
call. Run it after each deploy that touches the API, and before any public release.

## Deploy

1. `npm run build -w site`.
2. `cd worker`; first time: `npx wrangler kv namespace create WEBAPP_FILES` and paste the id
   into `wrangler.jsonc`; `npx wrangler d1 create app-game-store` and paste the id into
   `wrangler.jsonc`; then `npx wrangler d1 migrations apply app-game-store --remote`. The D1
   database and the Worker keep the name `app-game-store` after the repository rename.
3. `npx wrangler deploy`.
   A deploy whose migrations change catalogue tables goes: create any new R2 bucket (`npx wrangler r2 bucket create
   ourapps-catalogue`), apply the migrations, then deploy at once. Between the last two, the old Worker answers 500 on
   catalogue routes (only `worker/src/catalogue-db.ts` reads those tables).
4. `PUBLIC_ORIGIN` in `wrangler.jsonc` must equal the live origin; the GitHub OAuth App
   callback must be `<PUBLIC_ORIGIN>/api/auth/callback`.

## Schema changes

Add a new numbered file under `worker/migrations/`; never edit an applied one. Tests apply
all migrations to a fresh D1 before each file runs.

## Exporting D1

`component_fts`, `recipe_fts` and their `fts5vocab` tables (`component_vocab`, `recipe_vocab`) are virtual tables. There are two ways to export:

- **To read or keep a copy:** `npx wrangler d1 export app-game-store --remote --output dump.sql --compatibility sqlite3_cli_only`
  (the flag needs wrangler 4.159.0 or newer; `worker/package.json` requires it). The file opens with the `sqlite3`
  command-line tool, virtual tables included, but it cannot be imported back into D1.
- **To import into D1 again** (a restore or a copy to another database): drop the four virtual tables, export without
  that flag, then create them again (the `CREATE VIRTUAL TABLE` lines in `worker/migrations/0022_catalogue_scale.sql`)
  and refill the full-text tables from the entry rows; the vocab tables need no refill:

```
INSERT INTO component_fts (rowid, name, title, summary, class, tags)
  SELECT seq, name || ' ' || replace(slug, '-', ' '), COALESCE(class_title, ''), description,
         COALESCE(class_name || ' ' || COALESCE(class_title, ''), ''), tags FROM components WHERE latest_version IS NOT NULL;
INSERT INTO recipe_fts (rowid, name, title, summary, class, tags)
  SELECT seq, name || ' ' || replace(slug, '-', ' '), title, summary, '', tags FROM recipes WHERE latest_version IS NOT NULL;
```

  Search finds nothing between the drop and the refill.
