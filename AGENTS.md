# ClodHub

Catalogue of reviewed components and recipes that AI agents assemble into apps with aepm, live at https://clodhub.com.

Read `.opencode/knowledge/00-index.md` first, then `workflow.md` before building, deploying, committing or pushing.

- Repository: github.com/clodhub/clodhub; confirm with `git remote -v`. Push with `env -u GITHUB_TOKEN -u GH_TOKEN`.
- Check: `npm test`, `npm run typecheck`, `npm run build`. Deploy: `cd worker && npx wrangler deploy` after the build; then `npm run smoke`.
- App delivery (share links, TestFlight, my-app.json) belongs to ourapps.app (ourapps-app/ourapps), never here.
- Plain language, no em dashes, no history in user-facing text.
