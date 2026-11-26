# Contract for recipe and component repositories

What a recipe or component repository must publish to join the ClodHub catalogue, and the requests that publish it.
ClodHub never looks at your source; it keeps a catalogue entry and a pointer to your release.
Served at https://clodhub.com/contract.md; the API reference for agents is at
https://clodhub.com/agents.md. Delivering a finished application to people's devices is
ourapps.app's contract: https://ourapps.app/contract.md.

## Package names

Every package is named by its package URL (ECMA-427) without a version: `pkg:clod/<namespace>/<name>`, for example `pkg:clod/com.clodhub/presence`. Name and version are separate fields in every file; joined with `@` they form the versioned package URL, `pkg:clod/com.clodhub/presence-class@1.1.0`. Interface types and data format names are `<namespace>/<name>` (`com.clodhub/card-deck`), with the version separate; they are not package URLs.

- The scheme and type are exactly `pkg:clod/`, with no qualifiers, no subpath and no percent-encoding.
- Namespace: one segment, a lower-case reverse domain name of at least two labels, at most 100 characters. Labels are `a-z`, `0-9` and `-`, 1 to 63 characters, not starting or ending with `-`; the first starts with a letter.
- Name: a letter, then letters, digits and single hyphens between them, 2 to 64 characters, not `search`. It is the catalogue's short name (`slug`), unique across namespaces.
- Kind by suffix: a name ending in `-class` is a class, one ending in `-recipe` a recipe, any other a component. A manifest's kind must equal its name's kind.
- Version: `MAJOR.MINOR.PATCH`, each 0 or up to 9 digits without a leading zero; components and recipes may add `-preview.N`. A class version has no preview.
- Namespaces: `io.github.<owner>` belongs to that GitHub user or organisation. Any other namespace belongs to the GitHub owner ClodHub assigns it to; `com.clodhub` belongs to the clodhub organisation, which publishes every package today. A package's source repository belongs to its namespace's owner, and the publisher is that owner or an active member of it.
- clod's command line takes short forms: `<name>` for `pkg:clod/com.clodhub/<name>`, `<namespace>/<name>` otherwise, each with an optional `@<version>` (`clod fetch ourpoker-recipe@0.13.0`). Files always hold the full form.
- The `clod` package URL type definition (ECMA-427 type definition schema 1.0): https://clodhub.com/purl/clod-definition.json.

Formats: `component.json` 4, `recipe.json` 3, `class.json` 3, the catalogue component entry 4, the recipe entry and class body 3, the build report 2. Earlier numbers are refused.

## Recipe and component repositories

A recipe or a component is published from its own GitHub repository. ClodHub keeps a catalogue entry (name, version, digests, descriptions, declarations) and a pointer to the repository's release; the package itself stays in the release. The package is the source code: one archive file (`.tar`, made by `clod pack`) holding the implementation, the contract, the tests and a manifest that lists every file with its fingerprint; a recipe's archive holds `recipe.json` and the recipe's own application code and text, and names its slots, each with the class of component it needs and the component it prefers by exact version, without including them.

### A component repository implements

- A GitHub release for each version, tagged for it (for example `v0.1.0`), with the package as a release asset (for example `card-deck-0.1.0.tar`).
- In the package: `component.json` (format 4) with identity `name` a component package name and `version`, its provided and required interfaces, and `suitability.json` (who the component suits: jobs, profiles with load, cost, regions, compliance). A component that keeps data also has `migration.json` with a portable export format.
- Its repository belongs to the owner of its namespace (`pkg:clod/io.github.acme/card-deck` is published from a repository owned by `acme`, for example `acme/card-deck`).
- `dependencies` in `component.json` (exact `{ name, version }` of components its code imports) are sent in the catalogue entry, so a deprecation of one of them reaches this component and the recipes that use it.
- A `requires` entry is `{ id, type, version }` with an optional `optional: true`; an optional requirement may stay unconnected in a recipe. `provides` entries have no `optional`. Every type is an interface type `<namespace>/<name>`, and the port id is its name (`com.clodhub/card-deck` has the id `card-deck`).
- Every recipe and component publication requires `foundations`: `{ licence, platforms, classes, implements, upstream, compatibility, maintenance, files, artefacts }`. `licence` is the unchanged `identity.licence` expression string; the remaining fields are copied from the validated package manifest. The publisher derives these fields and the outer name, version, kind, archive digest, ports and settings from `clod.bundle.read_archive`. `settings` maps each `collect` entry to `{ id, type, grammar, required, secret, hasDefault }`, where `hasDefault` is presence of the `default` key. Provided document digests and module declarations remain descriptive fields. Full field mapping and examples: [package foundations](docs/package-foundations.md).
- Package facts are publisher-declared. The Worker checks structure, canonical class descriptor digests and declared fit without downloading the archive or executing tests. Public version responses include `foundationEvidence: "publisher-declared"` and a `foundations` summary with counts; `GET /api/{recipes,components}/:name/:version/details` returns the full foundations. Guardian names and test declarations do not establish successful execution. clod checks archive identity, file bytes, provenance, signed review evidence and the selected graph.
- Interface documents use the `x-clodhub-` prefix for their own keywords (`x-clodhub-interface`, `x-clodhub-property`, `x-clodhub-constant`, `x-clodhub-modules`). Entry modules are declared under `x-clodhub-modules`, platform to path; the entry's `interfaceModules` records them. No other prefix is read.
- A `suitability.json` profile may carry `settings`, an object from setting id to a string, number or boolean that the profile applies when a recipe selects it.

### A recipe repository implements

- A GitHub release for each version with the package as a release asset.
- In the package: `recipe.json` (format 3: name, a recipe package name, version, title, summary, category, tags, `targets.client` from `web ios android macos windows tvos`, `targets.server`, components, jobs, scale, questions, connections, tests, page, instructions), the page description (Markdown or text), an optional SVG diagram, and `INSTRUCTIONS.md`.
- Each entry of `components` is a slot: `{ id, class: { name, version, digest }, preferred: { name, version }, configuration, includedWhen }`, where `class.name` is a class package name and `preferred.name` a component package name. The exact class reference resolves in the recipe manifest's `classes`, independently of the preferred component. Each class entry is `{ reference, descriptor }`; `reference.digest` is the lowercase SHA-256 of the descriptor's RFC 8785 canonical bytes. The descriptor owns interface declarations, per-platform module paths, closed settings schema, file/digest inventory and shared behaviour suites. The reserved `application` instance names the recipe's own component.
- A candidate carries the same class declaration and lists its exact reference in `implements`. It provides the class interfaces at their versions, adds no nonoptional requirement, accepts class setting types and grammars, introduces no required setting without a default, and installs each relevant class module. Provider interface documents need not match the preferred implementation's bytes. `clod alternatives <recipe>@<version> <slot> --store store` lists fitting implementations; `clod design ... --substitute <slot>=<name>@<version>` selects one.
- Platforms are `web`, `server`, `ios`, `macos`, `tvos`, `android`, `windows`. Selected targets include `server` whenever the recipe declares it. Runtime range intersections must be nonempty; framework roles must agree on names and ranges; shared exact dependency pins must agree, while isolated versions may differ. Global stylesheet namespace overlap and declared stylesheet conflicts fail fit. Publication checks every candidate against the recipe authority and graph conflicts among unconditional, non-job preferred slots; conditional selection and answer evaluation remain in clod.
- Wrapper and upstream licences are distinct expressions. Each upstream record declares exact name/version, revision, repository, package URL, notices and delivery. Bundled delivery lists source file digests. Build-time delivery names `npm`, `gradle` or `swift`, an exact lock and its digest. npm also declares `packagePath` and integrity; Gradle declares verification metadata, configurations and artifact digests; Swift binds an exact source revision. Bundled Gradle wrappers carry their own inventory and distribution checksum. Maintenance declares owners, contact, repository and update source/strategy.
- A slot is included when its `includedWhen` is null or true. `includedWhen` and a question's `askWhen` are conditions: CEL (Common Expression Language, https://cel.dev) expressions of type bool, for example `"video"`, `"'ios' in targets"`, `"computerPlayers != 'none'"`, `"scale in ['medium', 'large']"` or `"storeInvitation != ''"`. Each question id is a variable holding its answer: a `set` question is a list of strings, `boolean` a bool, `integer` an int, and `choice`, `text`, `secretRef` and `account` a string. A condition uses only literals (quoted text, whole numbers, `true`, `false` and lists of one type), question ids, `==`, `!=`, `<`, `<=`, `>`, `>=`, `in` (list membership), `&&`, `||`, `!`, parentheses and `size()`. The check parses each condition with `@bufbuild/cel` and type-checks it to bool; text compared with a choice or set question must be one of its options, and a question's `askWhen` may not lead back to itself.
- A question is `{ id, question, ask, askAgent, askWhen, type, options, default, min, max, effects }`: `question` is the text, `ask` is `required`, `unless-settled` or `default` (see "Recipes" under "Catalogue publish API"). `type` is `set`, `choice`, `boolean`, `integer` (with `min` and `max`), `text`, `secretRef` or `account`. A `required` question has no `default`; an `unless-settled` or `default` question has one, which it also takes when its `askWhen` is false. Questions of type `secretRef` carry no value and no default, so they are `required`.
- An effect is `{ "sets": { "<slotId>.<settingId>": value } }`; the slot id may be `application`. The setting must be declared in the slot's class configuration, and literals must validate against it. `includes` is not an effect: a slot is included only through `includedWhen`. A value is a literal, `"$answer"` (a set becomes a space-separated string), `{ "map": { "<option>": literal } }` (a choice question, one entry per option), `{ "fromScale": "concurrentPeople" | "requestsPerDay" | "storedMegabytes" }`, `{ "template": "prefix-{{answer}}" }` or `{ "ref": "<secretRef question id>" }`. A secret setting takes only `ref`. Two questions may not set one target to different values unless their `askWhen` conditions cannot both hold, which the check proves only when both confine one question to values that do not overlap: `==` a literal, `in` a list, a boolean question alone or negated, joined by `&&` and `||`.
- A job is `{ id, slot, candidates: [{ component, version?, profile, includedWhen? }], overrideQuestion? }`; a candidate other than the slot's preferred component carries `version`; `overrideQuestion` names a choice or text question whose answer restricts the candidates first. `scale` is `{ question, bands }`: the question is a choice whose options are the band ids, and a band is `{ id, label, load }`.
- A connection joins `{ instance, port }` endpoints whose instances are slot ids or `application`; the source port is one its class provides, the target port one its class requires, both of one type and version.

### Catalogue publish API

The publish tool sends these requests with a `manage` API key (`Authorization: Bearer ch_...`) or a signed-in session. Every body is JSON unless stated; every error is `{ "error": "<what is wrong>" }`. Component entries are format 4, recipe entries and class bodies format 3. A body in an earlier format is refused with 400 `invalid entry: format-refused: ...`, and the version is published again with the current tool.

Order for one package version: upload its images, publish the class it implements (once per class version), then publish the component or recipe.

#### Categories

```
POST /api/dev/categories          classes/categories.json
{ "format": 1, "categories": [{ "id": "games", "title": "Games", "parent": null }, { "id": "games/cards", "title": "Cards", "parent": "games" }] }
-> 200 { "status": "published", "added": ["games/cards"], "renamed": [], "total": 42 }
```

- Only the catalogue's curators (numeric GitHub user ids in the Worker's `CATALOGUE_CURATORS`) may send it; anyone else gets 403.
- `id` is a category path: lowercase segments of letters, digits and hyphens joined by `/`, at most 6 deep. `parent` is the path without its last segment, or null. A parent must be in the body or already in the tree.
- Missing categories are added, existing ones take the new title; nothing is removed.

#### Classes

```
POST /api/dev/classes
{ "format": 3, "class": <class.json> }
-> 201 { "status": "published", "name": "pkg:clod/com.clodhub/card-deck-class", "version": "1.0.0", "digest": "sha256:<hex>", "url": "https://clodhub.com/classes/card-deck-class", "api": "https://clodhub.com/api/classes/card-deck-class/1.0.0" }
-> 200 the same with "status": "unchanged" when that version is already published with that digest
```

- `class` is class.json itself (format 3; an earlier format is refused with `class-format-refused`): `{ format: 3, name, version, title, summary, category, presentation, provides, requires, settings, inventory, verification }`. `title` is at most 80 characters, `summary` at most 300, `category` a path that exists in the tree, `presentation` `visual` or `none`. The same four fields are required on every descriptor in a package's `foundations.classes`, and they are inside the descriptor digest.
- The digest is computed by the catalogue (sha256 of the RFC 8785 canonical descriptor); the body carries none.
- `name` is a class package name (ending in `-class`). The publisher must be its namespace's owner (`clodhub` for `com.clodhub`) or an active member of it: by the memberships read at their last sign-in (sign-in asks for `read:org`), or else by their saved GitHub token. A token GitHub refuses for lack of scope gets 403 "the saved GitHub token cannot read organisation membership; sign in to clodhub.com again"; a non-member gets 403, and so does a member of an organisation that restricts third-party apps and has not granted ClodHub access; the message says how to grant it. A namespace with no owner gets 403. A class name belongs to the first developer who published it; anyone else gets 409.
- 400 invalid class (the message lists the codes, for example `class: class-fields`) or a category outside the tree; 409 the name belongs to another developer, or the version is published with another digest.

#### Images

```
PUT /api/dev/images/<sha256 hex>
Content-Type: image/png | image/webp
<the image bytes>
-> 201 { "status": "stored", "digest": "sha256:<hex>", "type": "png", "width": 1280, "height": 800, "bytes": 482113, "url": "https://clodhub.com/images/<hex>.png" }
-> 200 the same with "status": "unchanged" when that sha256 is already stored
```

- The catalogue checks that the sha256 of the bytes equals the one in the address (422 otherwise), that the size is at most 2 MiB (413), that width and height are 1 to 16,384 pixels, and that the bytes are a complete image of the declared type (422): a PNG has valid chunks with correct CRCs from IHDR through IEND at the end of the file, with at least one IDAT; a WebP has a RIFF size equal to the file size, chunks that fill it exactly, and one complete VP8 or VP8L image (no animation; only VP8X, VP8, VP8L, ALPH, ICCP, EXIF and XMP chunks). Metadata (PNG chunks other than IHDR, PLTE, IDAT and IEND; WebP ICCP, EXIF and XMP) is at most 64 KiB in total. Nothing is decompressed. Other types get 415.
- A developer may upload `IMAGE_UPLOADS_PER_DAY` images in 24 hours (300 unless the Worker sets it); more gets 429.
- Every developer who sends an image's bytes is recorded as its uploader, including when another developer sent them first (the answer is then 200 "unchanged"). An image is kept once a published entry names it. An entry may name an image no entry names yet only if the same developer uploaded it. An image no published entry names within 24 hours of upload is removed.
- Upload each image and its 480-pixel-wide WebP thumbnail (a thumbnail of an image narrower than 480 pixels keeps its width). Images are served at `GET /images/<hex>.<png|webp>` with `Cache-Control: public, max-age=31536000, immutable`.

#### Components

```
POST /api/dev/components
{
  "format": 4,
  "name": "pkg:clod/io.github.acme/card-deck", "version": "0.1.0", "digest": "sha256:<archive>",
  "description": "...", "page": { "description": "<markdown>" },
  "tags": ["cards"], "targets": { "client": ["web"], "server": [] }, "guardians": ["Level N Ltd (guardian key 08775f20)"],
  "provides": [{ "id": "card-deck", "type": "com.clodhub/card-deck", "version": "1.0.0", "description": "Playing cards: create, shuffle, deal and burn ..." }],
  "requires": [{ "id": "random-source", "type": "com.clodhub/random-source", "version": "1.0.0", "description": "...", "optional": true }],
  "settings": [{ "id": "seed", "type": "string", "grammar": "label", "required": false, "secret": false, "hasDefault": true, "default": "Table one" }],
  "interfaceDigests": { "com.clodhub/card-deck@1.0.0": "sha256:<hex>" }, "interfaceModules": { "com.clodhub/card-deck@1.0.0": { "web": { "path": "web/index.ts", "installed": true } } },
  "dependencies": [], "suitability": <suitability.json>, "migration": null,
  "source": { "repository": "acme/card-deck", "tag": "v0.1.0" }, "bundle": { "asset": "card-deck-0.1.0.tar", "digest": "sha256:<asset>" },
  "foundations": { "licence", "platforms", "classes", "implements", "upstream", "compatibility", "maintenance", "files", "artefacts" },
  "release": { "channel": "features", "fixes": [] },
  "images": [{ "digest": "sha256:<image>", "thumbnail": "sha256:<webp thumbnail>", "caption": "The table during a hand, night look", "platform": "web", "width": 1280, "height": 800 }],
  "vulnerabilityWaivers": [{ "id": "GHSA-xxxx-xxxx-xxxx", "reason": "the affected function is not reachable: ..." }],
  "quality": { "level": "reviewed", "certified": true, "liveTested": null }
}
-> 201 { "status": "published", "name": "pkg:clod/io.github.acme/card-deck", "version": "0.1.0", "url": "https://clodhub.com/components/card-deck", "api": "https://clodhub.com/api/components/card-deck/0.1.0" }
-> 200 the same with "status": "unchanged" for the same version and digest again
-> 200 the same with "status": "updated" for the same version and digest when that version is stored in an earlier component entry format, or when the body differs from the stored entry only in `description`, `page` and `tags` (and `quality`): the stored entry is replaced, and its downloads, vulnerability results, publication date and (unless the body sets one) quality stay
```

- `page.description` is Markdown of at most 20,000 characters, shown on the component's page: what the component is first, then sections under level-2 headings. A section headed `Examples` is shown with the opening text, one headed `Settings` above the settings table, and the others under "More about it". The Level N publish tool takes them from the archive's `CONTRACT.md`: "Purpose and facilities", then "Scenarios and presentation" as Examples, "User inputs" as Settings, and "Integration", "Infrastructure", "Verification" and "Updates and removal".
- Each of `provides` and `requires` carries `description` (at most 2,000 characters, may be empty): the description its interface document gives (`info.description` of an OpenRPC document).
- Each setting carries `default` exactly when `hasDefault` is true: the value clod writes when the recipe leaves the setting out, a boolean, a 32-bit integer or a string of the setting's grammar.
- `version` is `MAJOR.MINOR.PATCH`, or `MAJOR.MINOR.PATCH-preview.N` (N a positive integer) for the preview channel. No other pre-release form is accepted.
- `release` comes from the verified manifest. `channel` is `security` (patch above 0; `fixes` lists one or more OSV, GHSA or CVE ids; a features release of the same name on the same `MAJOR.MINOR` line must be published already), `features` (patch 0; `fixes` empty) or `preview` (`-preview.N`; `fixes` empty).
- `foundations.implements` names exactly one class, and that class's descriptor is in `foundations.classes`. That class name and version must be published (POST /api/dev/classes first) with the same digest; otherwise 400. The component's class, listing category and presentation come from the published class; the body has no `category` field.
- Every `foundations.upstream[].purl` is a package URL by the purl specification, pinned to the upstream version, with the namespace its type needs (`pkg:maven/<group>/<artifact>@v`, `pkg:swift/<host>/<owner>/<name>@v`, `pkg:golang/<module path>/<name>@v`; npm scopes as `%40scope`). Qualifiers are `key=value` pairs joined by `&`, keys lowercase letters, digits, `.`, `-` and `_` not starting with a digit, each once, values not empty; the subpath has no empty, `.` or `..` segment; every `%` starts a two-digit hex escape. A purl OSV still refuses is shown with vulnerabilities "unknown" (`count: null`, the purl in `unqueryable`).
- `images`: at most 12, read from the verified archive, each uploaded first (with its thumbnail) with the width and height stated. A component whose class has `presentation: "visual"` needs at least one. The first image is the main image. `caption` is at most 140 characters; `platform` is one of `foundations.platforms`.
- `vulnerabilityWaivers` is `[]` when none; each `reason` is at most 500 characters.
- `quality` is null or left out, except from a curator (by numeric GitHub id): `level` is `packaged`, `reviewed`, `integration-tested` or `live-tested` (each includes the ones before it), `certified` is true when the guardian signature is Level N's, `liveTested` is `{ at: "<ISO date>", platform }` for `live-tested` and null otherwise. Quality from anyone else gets 403.
- Ports, settings, interface facts and dependencies come from `clod.bundle.read_archive`; `foundations` is copied from the manifest (`licence` is `identity.licence`).
- The full entry is stored as a document; the listing keeps a summary of the newest listed version. The newest listed version is the highest that is not a preview, or the highest preview while nothing else is listed.

#### Recipes

```
POST /api/dev/recipes
{ "format": 3, "recipe": <recipe.json format 3>, "digest", "source", "bundle", "page": { "description": "<markdown>", "diagram": "<svg>" | null }, "foundations", "release", "images", "vulnerabilityWaivers", "quality" }
-> 201 / 200 as for components, with "url": "https://clodhub.com/recipes/<name>"
```

- `recipe.category` is a category path in the tree. A recipe with any client target needs at least one image of the application as built.
- recipe.json format 3: `name` is a recipe package name (ending in `-recipe`). Each question is `{ id, question, ask, askAgent?, askWhen?, type, options?, default?, min?, max?, effects }`. `question` is the text put to the person (at most 300 characters). `ask` is `required` (no default; always put to the person when its condition holds), `unless-settled` (has a default; asked when the request does not settle it) or `default` (has a default, taken unless the request says otherwise). A format 1 recipe.json is refused with `format-refused`.
- `release`, `images`, `vulnerabilityWaivers` and `quality` are as for components.

#### Quality after publishing

```
POST /api/dev/components/:name/:version/quality      (and /api/dev/recipes/:name/:version/quality)
{ "level": "integration-tested", "certified": true, "liveTested": null }
-> 200 { "name": "pkg:clod/io.github.acme/card-deck", "version": "0.1.0", "quality": { ... } }
```

Curators only (403 otherwise). It replaces the version's quality, for example when a published recipe whose review passed pins this version, or when live checks pass.

#### Build reports

```
POST /api/dev/recipes/:name/reports      a build report (tools/evidence/*.json), as the body
-> 201 { "status": "published", "id": "<32 hex>", "name": "pkg:clod/com.clodhub/ourpoker-recipe", "version": "0.13.0", "url": "https://clodhub.com/api/recipes/ourpoker-recipe/reports/<id>" }
-> 200 the same with "status": "unchanged" when that report is stored already
GET  /api/recipes/:name/reports          -> { name, currentVersion, reports: [{ id, version, digest, date, publishedAt, current, agent: { harness, model }, activeMinutes, costUsd, results, problems, rating, url, report }] }, newest first
GET  /api/recipes/:name/reports/:id      -> one of those
```

- Curators only (403 otherwise). The report's `recipe.name` is the recipe at `:name`.
- The body is format 2, kind `recipe-build`, with exactly these fields: `recipe` { name, version, digest }, `clod` { repository (owner/name), commit (7 to 40 hex) }, `date` (YYYY-MM-DD, not after tomorrow), `agent` { harness, model, session } (each at most 200 characters), `prompt`, `conditions` and `update` (each at most 2,000), `answers` (at most 60, each text of at most 500 characters, a number, true, false, null or a list of at most 30 texts of at most 100), `measured` { method (at most 1,000), elapsedMinutes, waitingForPersonMinutes, activeMinutes, replies, toolCalls, tokens { input, output, reasoning, cacheRead, cacheWrite, total }, costUsd }, `results` (1 to 20 of { target, built, tested, ran }, `tested` and `ran` at most 300 characters each), `problems` (at most 30, each at most 1,000) and `rating` { score (0 to `of`), of (1 to 100), by (at most 200), mostHelpful (at most 500) }. Texts are plain: no control or format characters, no tabs or line breaks, no leading or trailing space. At most 32 KiB in all. A report holding a secret is refused.
- `recipe.version` must have been published under the name with `recipe.digest`, now or before: the catalogue keeps every version and digest ever published per name (since migration 0002). Otherwise 422.
- The id is the first 32 hex digits of the sha256 of the report's RFC 8785 canonical JSON. Reports are kept by recipe name, version and id, apart from the version rows: unlisting or publishing again leaves them.
- A report whose every target `built` makes that version (with the report's digest) `integration-tested` when it is rated lower: at once when the version is listed, otherwise when it is published.
- The recipe page shows "Build reports" after "Build it", newest first, with a note on a report of another version than the current one; the text page lists one line per report with its `url`.

#### Errors common to entries

400 invalid entry (the message lists what is wrong, at most ten items); 403 quality from someone who is not a curator, or the GitHub account cannot push to the repository; 409 the name belongs to another developer or repository, the version is published with another digest, the developer has no GitHub token saved, or a limit is reached; 422 an image is not uploaded or differs, or GitHub cannot see the repository, the release or the asset, or the asset's digest differs; 502 GitHub could not be reached. Entries containing secret values are refused.

#### Other publishing routes

```
GET    /api/dev/components | /api/dev/recipes      -> { components: [{ name, slug, repository, latestVersion, status, deprecated, versions: [{ version, digest, publishedAt, channel, fixes, listed }] }] }
DELETE /api/dev/components/:name[/:version]          unlist one version, or every version; the rows and digests stay
DELETE /api/dev/recipes/:name[/:version]
POST   /api/dev/components/:name/deprecate           optional { replacement }; undeprecate reverses it
POST   /api/dev/recipes/:name/deprecate              the same for recipes
```

Deprecating a name flags every version; the catalogue then shows a warning on the entry and on every recipe and component that uses it, and agents read it as the `deprecations` array. A recipe or component whose developer deleted their account stays listed as orphaned and nobody can publish to its name.

#### What the catalogue reads back

`GET /api/{components,recipes}/:name/:version` (`:version` may be `latest`) returns, among the fields in agents.md, `versions: [{ version, digest, publishedAt, channel, fixes }]` for every listed version, `release: { channel, fixes }` of the shown version, `line: { line, securityReleases: [{ version, fixes, publishedAt }] }`, `quality`, `images`, `vulnerabilitySummary` and `vulnerabilityWaivers`. clod's `outdated` reads `versions` and needs no archive. `GET .../vulnerabilities` returns `{ name, version, checkedAt, count, advisories: [{ id, summary, severity, affected: [purl], fixedIn, waived }], unqueryable: [purl] }`; the catalogue checks every published version's purls (from `foundations.upstream`) at OSV daily. `count` is null before the first check, and when OSV refused one of the purls (listed in `unqueryable`). The hourly check sends versions whole: versions OSV never refused share batches; a version in a batch OSV refused is sent alone from then on, and its refused purls are found by halving, at most 12 requests a run for at most 3 runs. After that its purls still without an answer are listed in `unqueryable` for that version only; other versions naming them are checked as usual.

Public reads, bundle links and the plain-text and JSON variants are in agents.md.

Copyright Level N Ltd 2026.
