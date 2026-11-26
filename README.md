# ClodHub

A catalogue of reviewed components and recipes that AI agents assemble into apps with clod.
Live at https://clodhub.com.

- A **component** is a reviewed part of an application (a card deck, a seating plan, a video
  call) with a contract: the interfaces it provides and requires, its settings, the devices it
  runs on, who it suits and how its data moves.
- A **class** is the contract a component fills; components of one class can stand in for each
  other.
- A **recipe** lists the slots an application needs, each filled by a component of a class, the
  questions that choose between them and how they connect.

A coding agent reads a recipe, asks the person its questions and installs the application with
clod (https://github.com/clodhub/clod), which checks every archive's digest and signatures and
runs no package code while installing. Packages stay in their publishers' GitHub releases;
ClodHub keeps the catalogue entry and a pointer.

## What is here

- `/recipes`, `/components`, `/classes`, `/categories`: browse, filter and search. Every page
  has a plain-text and a JSON variant (`/recipes/<name>.txt`, `.json`, `/recipes/<name>/details.txt`).
- `/api/...`: the read API, no key needed; `/api/dev/...`: publishing with a `ch_` API key or a
  browser session. Every endpoint: `site/public/agents.md` (served at `/agents.md`).
- `/dev`: sign in with GitHub, save the GitHub token publishing uses, make API keys.
- `/guide`, `/small`, `/free-tiers.md`, `/cloud-assembly.md`, `/clod-assemble.yml`,
  `/policy/levelnpolicy.json` (Level N's release and guardian keys for clod's owner policy).
- `CONTRACT.md` (served at `/contract.md`): what a recipe or component repository implements,
  and the publish API.

Delivering a finished application to people's devices is a separate service, https://ourapps.app
(repository ourapps-app/ourapps).

## Layout

| path | what |
|---|---|
| `worker/` | Cloudflare Worker: catalogue API, sign-in, API keys, bundle links, hourly checks; D1 and R2 |
| `site/` | Vite and TypeScript site served by the Worker |
| `shared/` | recipe, component and class validation, foundations, diagrams, the terms version |
| `scripts/` | `smoke.mjs` (live check), `validate-recipe-file.ts`, `render-diagrams.ts` |

## Develop

```
npm install
npm test
npm run typecheck
npm run build
cd worker && npx wrangler d1 migrations apply clodhub --local
npm run dev -w worker      # http://localhost:8787, after npm run build
```

Copy `worker/.dev.vars.example` to `worker/.dev.vars` for local secrets.

## Deploy

```
npm run build
cd worker
npx wrangler d1 migrations apply clodhub --remote   # after adding a migration, then deploy at once
npx wrangler deploy
npm run smoke                                       # from the root
```

Worker secrets: `LINK_SECRET`, `MASTER_KEY`, `GITHUB_OAUTH_CLIENT_ID`,
`GITHUB_OAUTH_CLIENT_SECRET` (`npx wrangler secret put <name>`). Rotation: `SECURITY.md`.

Source: https://github.com/clodhub/clodhub. The source is public for reading and review; it is
not open source. All rights reserved, see `LICENSE`. Outside contributions are not accepted
(`CONTRIBUTING.md`); report security problems privately (`SECURITY.md`).

Copyright Level N Ltd 2026.
