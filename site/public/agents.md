# ClodHub for agents

ClodHub is a catalogue of reviewed components and recipes. A component is a reviewed part of an application, such as a card deck or a seating plan; a recipe lists the components an application needs, the questions that choose between them and how they connect. An AI agent assembles an application from a recipe and a person's answers with aepm, the installer. Developers publish recipes and components from their own GitHub repositories; anyone reads them. This document is the complete reference for driving it programmatically.

Base URL: `https://clodhub.com`. All request and response bodies are JSON. Errors are `{"error": "message"}` with a 4xx or 5xx status.

Related: https://clodhub.com/contract.md says what a recipe or component repository implements and gives the exact publish requests.

## Authentication

Reading needs no key. Publishing sends `Authorization: Bearer <api key>` on every `/api/dev/*` request. Keys start with `ch_` and are created by the developer in a browser at `/dev`. A key acts as that developer within its scope.

- Scope `manage` allows every method; scope `read` allows only GET and returns 403 `this API key is read-only` otherwise.
- Keys may carry an expiry; an expired or revoked key gets 401.
- A key can never create or revoke keys, change credentials (`PUT /api/dev/secrets`), delete the account or sign out sessions. Those need the developer in a browser.
- Keys are stored as keyed hashes; treat yours as a password and never write it to a file or a log.

Check who you are (`GET /api/auth/session` returns the same, or `null` with status 200 when nobody is signed in; the site uses it):

```
GET /api/dev/me
-> { "developer": { "id", "slug", "displayName", "githubLogin", "createdAt", "termsAcceptedVersion", "termsAcceptedAt" }, "authVia": "key", "scope": "manage",
     "termsVersion": "...", "secrets": { "github": true, "githubSavedAt": "..." } }
```

`secrets.github` false means the developer has not saved a GitHub token, and publishing answers 409 until they do (only they can, at `/dev`). The token must see the repositories they publish from, which they must be able to push to, with Contents read for their releases.

## What the developer must do themselves

Tell the developer plainly when a task is theirs; do not try to work around it:

- Signing in with GitHub, accepting the terms, and saving a GitHub fine-grained token at `/dev` (there is no API for credentials).
- Creating API keys (browser session only).
- Publishing classes in an organisation's scope needs membership of that organisation on GitHub; an organisation that restricts third-party apps needs the developer to press Grant for ClodHub (GitHub Settings, Applications, Authorized OAuth Apps) and sign in again.

## Free services for the app's backend

https://clodhub.com/free-tiers.md lists services whose free plans fit apps for small organisations (a few dozen users; a larger one chooses a paid provider tier) (realtime servers, video calls, databases, sign-in, AI, notifications, email, maps, analytics, builds, hosting), each with limits, catches, setup steps and secret names. Re-check the linked source before relying on a number. A developer's personal AI subscription (Claude, ChatGPT, Gemini, Copilot) must never be used to serve the app's users.

## Recipes and components

Recipes (applications assembled from questions) and components (reviewed parts) are published by developers and read by anyone. The service keeps each entry and a pointer to the publisher's GitHub release (repository, tag, asset name, digests). It never stores the package. What a recipe or component repository implements is in contract.md.

### What a downloaded package is

A component package is the source code itself, not a link to code. It is one archive file (`.tar`, made by `aepm pack`) holding: the working implementation for each device or server it supports (ordinary source files); its contract (the interfaces it provides and requires, as data, with documentation and instructions for an agent); its tests and the tool versions they need; and `component.json`, which lists every file with its fingerprint and where it goes in the application. It does not include the components it requires (separate downloads), the person's settings or any secret.

A recipe package is source code and a form: one archive file holding `recipe.json` (the questions, the slots (each the class of component it needs and the component it prefers, by exact version), the settings that connect them, the choice of providers by size, the tested answer sets), the recipe's own application-specific component (screens, artwork, sounds, translated text, rules, end-to-end tests), and `INSTRUCTIONS.md`. The components that fill its slots are not inside; each is a separate download.

The archive is a release file on the publisher's public GitHub repository; ClodHub keeps the catalogue entry and a pointer to the release, and does not hold or run the code. `digest` and `bundle.digest` are the sha256 fingerprint of the archive; check it before opening the archive. Installing with aepm copies the listed files into the application and runs none of the package's code.

### Building an application from a recipe (instructions for agents)

You need Python 3.12, Node.js and Graphviz. aepm is the installer: https://github.com/clodhub/aepm.

```
git clone https://github.com/clodhub/aepm && export PYTHONPATH=$PWD/aepm
python3 -m aepm fetch <recipe>@<version> --with-dependencies --store store
tar -xf store/objects/<recipe digest without sha256:>.tar INSTRUCTIONS.md   # the recipe's instructions; works in PowerShell and cmd on Windows 10 version 1803 or later too; each recipe's .txt page gives it with the digest
python3 -m aepm questions <recipe>@<version> --store store
# answer from the person's description; ask only what it leaves open; write answers.json (question id to answer)
python3 -m aepm design <recipe>@<version> --store store --answers answers.json --out definition.json
python3 -m aepm doctor <recipe>@<version> --store store --answers answers.json   # --install installs missing build tools it can
python3 -m aepm resolve definition.json --catalogue store/catalogue.json --out lock.json
# policy.json: Level N's release and guardian keys (https://clodhub.com/policy/levelnpolicy.json) plus your own owner key
python3 -m aepm install definition.json --lock lock.json --store store --policy policy.json --target app
# trustedExecution: the digest of each package in lock.json, so verify may run their checks
python3 -c 'import json; p=json.load(open("policy.json")); p["trustedExecution"]=sorted(x["digest"] for x in json.load(open("lock.json"))["packages"]); json.dump(p, open("policy.json", "w"), indent=2)'
python3 -m aepm verify app --policy policy.json --trusted --allow-network
```

A recipe's .txt page adds, under these steps, the recipe's own "Building it" notes from its description (for example a deploy in two steps). `fetch` checks every archive's sha256 against the catalogue and downloads the release and guardian signatures. `design` applies the recipe's rules to the answers and fails with a list of what is missing. `install` checks every signature against the policy, copies the listed files and runs none of their code. The recipe archive's `INSTRUCTIONS.md` has the policy step in full and the build and run commands for each device (section "Build and run").

With no machine of the developer's: the same steps run in GitHub Actions, from `answers.json` committed to the developer's repository, through the workflow at https://clodhub.com/aepm-assemble.yml; the design's `ourapps-release` workflows then check, release and update the application. Steps and secrets: https://clodhub.com/cloud-assembly.md.

### Using a recipe or component (instructions for agents)

1. Find: search with `GET /api/recipes?q=` or `GET /api/components?q=` (no key), narrowed by category, class, platform, quality and the other facets below. Read an entry as plain text at `/recipes/<name>.txt` or `/components/<name>.txt`, or as JSON at `GET /api/recipes/<name>/latest`. Check `deprecations`; tell the developer before building on a flagged entry.
2. Download: `GET /api/{recipes,components}/<name>/<version>/bundle` returns a link valid for one hour and the digest (at most 60 links a minute per address; each address counts as one download per version and day). Verify the digest before opening the package. Each package's public source is `https://github.com/clodhub/<name>`.
3. Tools: `aepm` (fetch, questions, design, alternatives, doctor, resolve, install, verify, review, propose-update, approve, apply, recover, pack, inspect, bom, sign, export, execution-request and authorize-execution) is at `https://github.com/clodhub/aepm`; it needs Python 3.12, Node.js and Graphviz, and runs no package code during installation. There is no single command that assembles an application and no published tool that scaffolds or checks a component; never claim one exists.
4. Slots: each slot of a recipe names a class (the interfaces the recipe connects to it and the settings it writes) and a preferred component. Any catalogue component that fits the class may fill the slot instead: `aepm alternatives <recipe>@<version> <slot> --store store` lists them, `aepm design ... --substitute <slot>=<name>@<version>` uses one. `/components?class=<scope>/<name>` lists the components implementing a class, and `/classes/<name>` compares them.
5. Build: `aepm questions` gives `toAsk` and `followUps`. Tell the person how many questions `toAsk` lists, ask them in one round with the follow-ups one of those answers could trigger as conditional questions, and add no others; never invent a secret, account name or address. Read `INSTRUCTIONS.md` in the recipe bundle for which answers include which components and set which settings. Show the person the component and settings list before installing. Install with aepm, review each package, and report what was built, what was not, and what the person must do (accounts, tokens, store setup).

### Reading (no authentication, JSON)

```
GET /api/recipes?<listing parameters>                       -> { query, total: { count, approximate }, next, previous, categories, recipes: [summary] }
GET /api/recipes/:name/:version                             -> the version (":version" may be "latest")
GET /api/recipes/:name/reports                             -> { name, currentVersion, reports: [{ id, version, date, current, agent, activeMinutes, costUsd, results, problems, rating, url, report }] }: agents' build reports, newest first
GET /api/recipes/:name/:version/bundle                      -> { name, version, digest, asset, assetDigest, status, url, expiresAt, deprecations }
GET /api/recipes/:name/:version/deprecations                -> { name, version, status, affected, checked, deprecations }
GET /api/recipes/:name/:version/diagram.svg                 -> the design diagram
GET /api/recipes/:name/:version/details                     -> { name, version, foundationEvidence, foundations }
GET /api/recipes/:name/:version/vulnerabilities             -> { name, version, checkedAt, count, advisories: [{ id, summary, severity, affected, fixedIn, waived }] }
GET /api/components?<listing parameters>&class=&provides=&requires=
GET /api/components/:name/:version                          (":version" may be "latest")
GET /api/components/:name/:version/bundle
GET /api/components/:name/:version/deprecations
GET /api/components/:name/:version/details
GET /api/components/:name/:version/vulnerabilities
GET /api/classes?category=&cursor=&limit=                   -> { classes: [{ name, slug, version, title, summary, category, presentation, implementations, publisher, url }], total, next, previous, categories }
GET /api/classes/:name/:version                             -> the class with provides, requires, settings, suites, versions and implementationList
GET /api/categories                                         -> { categories: [{ id, title, parent, classes, components, recipes }] }
GET /images/<sha256>.<png|webp>                             -> an image, cached for a year
```

Listing parameters, the same on `/recipes`, `/components`, their `.txt` and `.json`: `q` (full-text search over name, title, summary, class and tags; a word of 3 or more characters also matches word starts, a shorter one whole words only. Results follow `sort` over every match: with at most 1,000 matches all are ordered at once; with more, a page may come back short after checking 20,000 entries and `next` continues, as for other filters. `relevance` with more than 1,000 matches ranks the 1,000 most downloaded matches), `category` (a path such as `games/cards`; a category includes everything below it), `class` (components only, `<scope>/<name>`), `platform` (`web server ios macos tvos android windows`), `licence`, `quality` (`packaged`, `reviewed`, `integration-tested`, `live-tested`: that level or above), `certified` (`true`: reviewed by Level N's guardian; `false`: by the publisher's), `channel` (`security`, `features`, `preview`), `secure=true` (no known vulnerability in the newest version), `publisher` (a developer slug), `deprecated` (`exclude`, `include`, `only`), `sort` (`relevance` with `q`, the default then; `downloads` in the last 30 days, the default otherwise; `trending`: downloads in the last 7 days above the weekly average of the 23 days before; `updated`; `name`), `limit` (1 to 100, default 30) and `cursor` (the `next` or `previous` value of the page before). A value outside a fixed set (`platform`, `quality`, `certified`, `channel`, `secure`, `deprecated`, `sort`) or a malformed value of any parameter gets 400; a well-formed `category`, `class`, `publisher`, `provides` or `requires` that matches nothing gives an empty page. `total.count` is exact up to 10,000; above that, or when a filtered listing stopped after checking 20,000 entries, `approximate` is true. Filtered totals are counted at most every ten minutes. `categories` holds the children of the chosen category (or the top categories) with their counts.

`:name` is the entry's short name (`poker-night`); full names are `<scope>/<name>` (`acme/poker-night`).

Every summary has `{ name, slug, version, category, platforms, licence, quality, channel, vulnerabilities, thumbnail, downloads, updatedAt, publishedAt, tags, publisher: { slug, displayName } or null, repository, url, status, deprecations }`; a recipe adds `title`, `summary`, `targets`, a component `description`, `class: { name, version, title }`, `targets`. `quality` is null or `{ level, certified, liveTested }`; `vulnerabilities` is the number of known advisories (waived ones excluded) or null until the first check; `thumbnail` is the main image's thumbnail address or null.

A version adds `digest`, `source` `{ repository, tag }`, `bundle` `{ asset, digest, url }`, `release` `{ channel, fixes }`, `line` `{ line, securityReleases: [{ version, fixes, publishedAt }] }`, `images` `[{ url, thumbnail, caption, platform, width, height }]`, `vulnerabilitySummary` `{ count, checkedAt, url }`, `vulnerabilityWaivers`, `versionDownloads`, `versions` `[{ version, digest, publishedAt, channel, fixes }]` and `foundations` (the summary below). A recipe version also has `description`, `diagram` (an address or null), `components` (each slot with `id`, `class`, `includedWhen`, `configuration`, `preferred` `{ name, version, url }` (`url` null when that version is not listed), `catalogue`: the preferred version's `description`, `profiles` (each `{ id, cost, load }`; the full suitability is on the component's version and in the recipe's details text), `guardians`, `quality` and `thumbnail`, or null, `deprecation`: its entry in `deprecations` or null, and `alternatives` `{ count, url }`: how many other listed components implement the slot's class and the listing of them), `contents` (as for a component), each slot's `classInfo` `{ title, summary, url }`, `jobs`, `scale`, `questions` (id, question, ask, askAgent, askWhen, type, options, default, min, max, effects), `connections`, `tests` and `instructions`. A component version also has `about` (the page text, Markdown), `classInfo` `{ summary, url, others, othersUrl }` (the class it implements and how many other listed components implement it), `contents` (what the archive holds: `files`, `groups` `[{ label, count, examples }]`, `installed` `{ count, root, folders }`), `provides`, `requires` (each with the interface's `description`, and with `optional: true` on a requirement that may stay unconnected), `guardians`, `settings` (each with `default` when it has one), `interfaceDigests`, `interfaceModules` (each provided interface document's `x-clodhub-modules` entry modules by platform, with whether the component installs them), `dependencies`, `suitability`, `migration` and `usedBy`.

Known vulnerabilities come from OSV: every day the catalogue queries each purl a published version bundles or downloads (its `foundations.upstream`) and counts the advisories that affect it, leaving out the ones the version waives.

The bundle route reads the release asset with the publisher's token and answers with a signed `/dl/` link valid for one hour (`status` `available`). It answers 502 when the release or asset is missing or its digest differs from the recorded one. Fetch the link right before downloading it. When the publisher deleted their account (`status` `orphaned`) no token exists: a public release is fetched without one and works the same way; a private or missing release answers 200 with `status` `bundle-unavailable`, `url` null and `expiresAt` null.

### Deprecated and orphaned entries

A name is flagged for every version in one of two ways. `deprecated`: its publisher deprecated it (reason `owner-deprecated`), optionally naming a replacement. `orphaned`: its publisher deleted their account (reason `owner-deleted`); it stays listed and downloadable (see the bundle route), has no publisher (`publisher` null) and no maintainer. Every summary and version response, every `.json` and `.txt` page and every bundle response carries `deprecations`, an array (empty when nothing is flagged) of `{ name, version, status, reason, since, replacement?, via }`: one element for the entry itself when it is flagged (`via` is `[]`), and one for every flagged component it uses or builds on, followed through component dependencies (`via` names what pulls it in: the recipe, or the component that depends on it). `status` on the entry is `active`, `deprecated` or `orphaned`; a recipe that merely uses a flagged component is `active` with a non-empty `deprecations`. In the `.txt` pages each element is a line starting `DEPRECATION WARNING:`. Use it to search for other components or similar recipes, or to decide never to update.

`GET /api/{recipes,components}/:name/:version/deprecations` resolves the whole tree of that version: `affected` is true when `deprecations` is not empty, `checked` counts the distinct components examined (listed or not). Every component that may fill a recipe's slots counts (preferred components and job candidates), including slots included only for some answers. `deprecated=exclude|include|only` filters lists and search on the entry's own flag; `include` is the default, so flagged entries appear with their warning. An orphaned name stays reserved: nobody can publish to it.

### Plain text and JSON for every public page

Each page has the same address with `.txt` or `.json`: `/recipes.txt`, `/recipes/:name.txt`, `/recipes/:name.json?version=0.1.0`, `/components.txt`, `/components/:name.json`, `/classes.txt`, `/classes/:name.txt`, `/categories.txt`. Lists take the listing parameters. A recipe's `.txt` page lists its questions in three groups ("Ask the person", "Ask unless the request settles it", "Defaults"), each follow-up with the answer that asks it. A recipe's `.txt` page gives, in this order, the summary, the build steps, the questions, the slots (class, preferred component, condition), the components and links; `/recipes/:name/details.txt?version=` holds the rest: the description, each slot's class interfaces, suitability and guardians, the connections, the tested answers, the versions and the package foundations with every upstream source. A component's `.txt` page gives its summary, the class it implements with each interface's entry modules, provides and requires, platforms, toolchains and frameworks, settings, suitability, the recipe.json slot that names it and the aepm commands to substitute it, the versions and links; `/components/:name/details.txt?version=` holds the package foundations: upstream sources, exact dependencies, styles, class inventories and the file and installation lists. The web pages show package facts as counts and link "Sources and dependencies" at `/recipes/:name/details?version=` and `/components/:name/details?version=`, which load the details route; a client that does not ask for HTML gets the `details.txt` page there. `GET /sitemap.xml` lists the public pages.

### Publishing (developer session or `manage` key)

The exact requests and responses for categories, classes, images, components, recipes and quality are in https://clodhub.com/contract.md, "Catalogue publish API". In short:

```
POST   /api/dev/categories                       classes/categories.json (curators only)
POST   /api/dev/classes                          { format: 2, class: <class.json> }
PUT    /api/dev/images/:sha256                   the image bytes, Content-Type image/png or image/webp
POST   /api/dev/components                       the component entry, format 3
POST   /api/dev/recipes                          the recipe entry, format 2
POST   /api/dev/components/:name/:version/quality   { level, certified, liveTested } (curators only)
POST   /api/dev/recipes/:name/:version/quality
GET    /api/dev/components                       -> { components: [{ name, slug, repository, latestVersion, status, deprecated, versions: [{ version, digest, publishedAt, channel, fixes, listed }] }] }
GET    /api/dev/recipes                          -> { recipes: [...] }
DELETE /api/dev/components/:name[/:version]      unlist one version, or every version
DELETE /api/dev/recipes/:name[/:version]
POST   /api/dev/components/:name/deprecate       optional { replacement: "<scope>/<name>" } of a published component; flags every version
POST   /api/dev/components/:name/undeprecate     clears the flag
POST   /api/dev/recipes/:name/deprecate          optional { replacement } of a published recipe
POST   /api/dev/recipes/:name/undeprecate
```

Deprecate and undeprecate answer `{ ok, name, status, deprecated: { since, reason, replacement } or null }`, are repeatable, and apply only to the developer's own names (404 otherwise). An orphaned entry cannot be changed by anyone.

Both entry bodies require `foundations: { licence, platforms, classes, implements, upstream, compatibility, maintenance, files, artefacts }` copied from the verified manifest (`licence` is `identity.licence`). Each `classes` entry is `{ reference: { name, version, digest }, descriptor }`; the descriptor is class.json (`format, name, version, title, summary, category, presentation, provides, requires, settings, inventory, verification`) and the digest hashes its RFC 8785 canonical form. A component implements exactly one class; its listing category is that class's category. Upstream delivery is a bundled file inventory or a build-time lock (`npm`, `gradle`, `swift`). Package facts are publisher-declared; the Worker checks structure and descriptor digests, not archive bytes or signed test execution. The release signature, the guardian signature and the review report are files of the release beside the archive (`<name>-<version>.release.dsse.json`, `.guardian.dsse.json`, `.review.json`); aepm fetch downloads them and aepm install checks them against the owner's policy. The catalogue does not store them; quality levels are set by the catalogue's publish tool from that evidence.

Public recipe and component versions expose `foundationEvidence: "publisher-declared"` and `foundations` as a summary: `{ licence, platforms, implements: [{ reference, provides: [{ type, version, modules }], requires, suites }], runtimes, frameworks, styles: { scope, namespaces, conflicts } (counts), maintenance, counts: { upstream, dependencies, classes, files, artefacts }, details }`; `details` is the address of the details route with the full lists. Recipe slot views expose `declaration` `{ provides, requires, settings, suites }`.

`recipe.json` rules: each `components` entry is `{ id, class: { name, version, digest }, preferred: { name, version }, configuration, includedWhen }`; its class resolves in the recipe manifest. Configuration values and `sets` targets must be declared in the class's settings; connections use the class ports. Every preferred component and job candidate must fit; the reserved `application` instance is the recipe's own component. Conditions are boolean Common Expression Language expressions over answers. Effects contain `sets`. Full forms: /contract.md.

## Terms

A developer must accept the current terms (`/terms`) in a browser before `/api/dev/*` works for their session; API keys are not gated by the terms. `GET /api/dev/me` returns `termsVersion` and `developer.termsAcceptedVersion`. `DELETE /api/dev/me` (browser only, body `{"confirm": "<github login>"}`) removes the account; its recipes and components stay listed as orphaned.

## Developer settings

```
PUT /api/dev/me        body: { "slug": "george", "displayName": "George" }   (manage scope)
PUT /api/dev/secrets   browser only; returns 403 for API keys
GET /api/dev/audit     -> { "events": [ { "event", "detail", "country", "createdAt" } ] }   (recent security events)
GET /api/dev/keys      -> { "keys": [ { "id", "developerId", "name", "prefix", "scope", "createdAt", "expiresAt", "lastUsedAt", "revokedAt" } ] }   (creating and revoking keys is browser only)
```

If a task needs the GitHub token saved or changed, tell the developer to do it at `/dev`; there is no API path for it by design.

## Other endpoints

- `GET /api/health` -> `{ "ok": true, "oauth", "links", "secrets" }`: whether GitHub sign-in, bundle links and stored credentials are configured.
- `GET /api/auth/login` starts GitHub sign-in in a browser; it answers 503 while sign-in is not configured.

Delivering a finished application to people's devices (share links, TestFlight, Android packages, web apps, updates) is a separate service, ourapps.app; its reference is https://ourapps.app/agents.md.

Copyright Level N Ltd 2026.
