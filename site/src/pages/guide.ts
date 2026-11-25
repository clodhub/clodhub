// The guide: finding, using and publishing recipes and components. Public; signed-in developers see it in their frame.
import { CATEGORIES, CHECKED, PRINCIPLES, servicePrompt, type Service } from "../freeTiers.js";
import { whoAmI } from "../api.js";
import { escapeHtml, html, mount, raw, type Raw } from "../html.js";
import { cookingFigure } from "../figures.js";
import { setTheme } from "../theme.js";
import { callout, icon, wireCopy, wireImages } from "../ui.js";
import { SOURCE_URL, storeFrame } from "./public.js";
import { mountShell } from "./shell.js";
import { termsPending } from "./terms.js";

interface Section { id: string; title: string; body: Raw; sub?: { id: string; title: string }[] }

const kbd = (text: string) => html`<span class="kbd">${text}</span>`;

function sections(): Section[] {
  return [
    {
      id: "how-it-works",
      title: "How ClodHub works",
      body: html`
        <p>ClodHub is a catalogue of reviewed components and recipes that AI agents assemble into applications. A <b>component</b> is a reviewed, reusable part of an application, such as a card deck or a seating plan. It states what it provides, what it needs, who it suits and how its data moves. A <b>class</b> is the contract a component fills, so components of one class can stand in for each other. A <b>recipe</b> is a list of slots, each filled by a component of a class, the questions that choose between them, and how they connect. A coding agent assembles the application from a recipe and your answers with aepm, the installer.</p>
        <h3>How a recipe is cooked</h3>
        <p>You and your agent answer the recipe's questions. The recipe and your answers make a design: conditions decide which components are included, the answer about size chooses a provider for each job, settings are applied and every connection is checked. aepm then resolves exact versions, downloads each archive from its publisher's GitHub release, checks its digest and signatures, lets you review, installs by copying files without running their code, and verifies the result with the components' tests. The application runs on your own accounts; <a href="https://ourapps.app">ourapps.app</a> can deliver it to your people. Each update is proposed, approved by you and applied with recovery.</p>
        ${cookingFigure()}
        <h3>What you get</h3>
        <ul class="bullets">
          <li><b>Fast.</b> An application from a recipe in minutes, rather than days of building.</li>
          <li><b>Low cost.</b> Little AI spending. A clinic of fewer than ten people can run on free plans; a larger business pays only for the provider tier it needs, chosen from one answer about size (<a href="#free-tiers">free services</a>).</li>
          <li><b>Maintainable and safe.</b> Reviewed components, small updates you approve, security tests built in, a record of what is inside, and data you can move.</li>
          <li><b>Yours.</b> Your accounts and your data. Your application's servers and databases run on your own accounts, and there is no lock-in.</li>
        </ul>
      `,
    },
    {
      id: "find-recipe",
      title: "Find a recipe",
      sub: [
        { id: "find-recipe-browse", title: "Browse and search" },
        { id: "find-recipe-read", title: "Read a recipe" },
        { id: "find-recipe-agent", title: "Text, JSON and the agent API" },
      ],
      body: html`
        <h3 id="find-recipe-browse">Browse and search</h3>
        <p>Open <a href="/recipes">/recipes</a>. Filter by category and by device, hide or show only deprecated recipes, or type in the search box. Search matches whole words and the starts of words in a recipe's name, title, summary, tags and description, so "multiplay" finds a recipe tagged "multiplayer". No sign-in is needed.</p>
        <h3 id="find-recipe-read">Read a recipe</h3>
        <p>A recipe page shows its description and design diagram, the questions it asks (with the condition that asks each one and its default), the components it uses (with the condition that includes each one, their suitability and guardians), the load bands and jobs that choose between components, the devices it targets, the answer sets that were tested, and every version. The <b>Build it</b> box gives the line to give your agent, the aepm steps it runs (fetch, read the recipe's instructions, questions, design, doctor, resolve, install, verify), the recipe's own "Building it" notes when its description has them, and a link to download the recipe bundle; the link works for one hour.</p>
        <p>To use a recipe, answer its questions, or hand the page to your agent and let it ask you. A recipe never asks for a secret value, only for a reference to one.</p>
        <h3 id="find-recipe-agent">Text, JSON and the agent API</h3>
        <p>Every public page has the same address ending in <code>.txt</code> (plain text) or <code>.json</code> (JSON, the plain data format agents read): <code>/recipes.txt</code>, <code>/recipes/poker-night.txt</code>, <code>/recipes/poker-night.json?version=0.1.0</code>, <code>/classes.txt</code>, <code>/categories.txt</code>. Lists take the same query parameters as the API: <code>q</code> searches, <code>category</code>, <code>platform</code>, <code>quality</code>, <code>certified</code>, <code>channel</code> and <code>secure=true</code> filter, <code>sort</code> orders by downloads, trending, update or name, and <code>cursor</code> turns the page. A recipe's text page holds what an agent needs first (the build steps, questions, slots and components); <code>/recipes/poker-night/details.txt</code> holds the rest, including each package's upstream sources. A component's text page leads with its class, interfaces, platforms, toolchains, settings and the recipe slot that names it; <code>/components/card-deck/details.txt</code> holds its upstream sources, dependency pins and file lists. <a href="/sitemap.xml">/sitemap.xml</a> lists the public pages.</p>
        <pre><code>GET /api/recipes?category=games&amp;platform=ios&amp;sort=trending
GET /api/recipes?q=card+game&amp;deprecated=exclude
GET /api/recipes/poker-night/latest
GET /api/recipes/poker-night/0.1.0/bundle
GET /api/recipes/poker-night/0.1.0/deprecations</code></pre>
        <p>None of these needs a key. The bundle route answers with a signed download link valid for one hour, so fetch it right before downloading. Every field is in <a href="/agents.md">agents.md</a>.</p>
      `,
    },
    {
      id: "compose",
      title: "Compose from components",
      sub: [
        { id: "compose-search", title: "Search by interface" },
        { id: "compose-suitability", title: "Check suitability" },
        { id: "compose-warnings", title: "Deprecation warnings" },
        { id: "compose-classes", title: "Classes and substitutes" },
        { id: "compose-facts", title: "What a package declares" },
      ],
      body: html`
        <p>Open <a href="/components">/components</a>. Every component is a reviewed part with a contract and implements a <a href="/classes">class</a>, whose category is the component's. Filter by category, platform, quality, review, release channel and known vulnerabilities, search by name, title, summary, class and tags, and read a part's page for its images, versions, security releases and the recipes that use it. A class page compares every component that implements it side by side.</p>
        <h3 id="compose-search">Search by interface</h3>
        <p>A component <b>provides</b> interfaces and <b>requires</b> others. An interface has an id (<code>card-deck</code>) and a type (<code>ae/card-deck</code>). Two parts fit together when one provides a type the other requires. On a component page, the type in the Provides and Requires tables links to the components that need or offer it. In the API use <code>provides</code> and <code>requires</code>:</p>
        <pre><code>GET /api/components?provides=ae/card-deck
GET /api/components?requires=ae/card-deck&amp;platform=web
GET /api/components?class=clodhub/seating-class&amp;quality=reviewed
GET /api/components?q=seating&amp;deprecated=exclude</code></pre>
        <p>A requirement marked <b>optional</b> may stay unconnected in a recipe.</p>
        <h3 id="compose-suitability">Check suitability</h3>
        <p>Each component page lists the jobs the part can do and its suitability profiles: the load it carries, its cost, the regions it runs in, compliance notes and the provider. Choose the profile that fits how many people use the application and how often. The page also says how the part's data moves: the stores it keeps, the formats it exports, whether it must stop while data moves, and how many days data is kept after removal. Guardians are the parties whose signatures a part can carry; you choose which ones to trust.</p>
        <h3 id="compose-warnings">Deprecation warnings</h3>
        <p>A flagged component shows a <b>Deprecated</b> pill and a banner, and so does every component or recipe built on it. Read the banner before you choose the part. <a href="#deprecation">What an agent does with a warning</a>.</p>
        <h3 id="compose-classes">Classes and substitutes</h3>
        <p>Every component implements one or more <b>classes</b>. A class is an independent, versioned contract with its own fingerprint: the interfaces it provides and requires, the settings it takes, the entry modules each device needs, and a set of <b>shared behaviour tests</b>. A recipe slot names a class and a preferred component. Any component that implements the same class, on the devices you chose, can fill the slot instead, and the class's own tests run against that component's real code before it is signed. A component cannot replace the shared tests with its own.</p>
        <pre><code>aepm alternatives ourpoker@&lt;version&gt; theme --store store
aepm design ourpoker@&lt;version&gt; --store store --answers answers.json \
  --substitute theme=clodhub/theme-high-contrast@&lt;version&gt; --out definition.json</code></pre>
        <h3 id="compose-facts">What a package declares</h3>
        <ul class="bullets">
          <li><b>Devices</b>: the targets it supports (web, server, iPhone and iPad, Mac, Apple TV, Android, Windows). A web-only part never fits a native slot.</li>
          <li><b>Licences and sources</b>: the package's own licence, and separately each third-party source it contains or builds with, with its exact version, revision, licence and notice files.</li>
          <li><b>Contents</b>: whether third-party code is bundled in the archive or fetched at build time from an exact lock. Installing never downloads code.</li>
          <li><b>Compatibility</b>: runtime and framework version ranges, dependencies shared with other parts (which must agree) or kept isolated, and the stylesheet names it uses globally. Conflicts are refused before anything is installed.</li>
          <li><b>Maintenance</b>: owners, a contact, the repository and where updates come from.</li>
        </ul>
        <p>These are the publisher's declarations. aepm checks them against the archive and its signed review evidence. A recipe or component page shows these as counts; its <b>Sources and dependencies</b> link opens the lists (<code>/components/&lt;name&gt;/details</code>, as text at <code>/components/&lt;name&gt;/details.txt</code>). The release signature, the guardian signature and the guardian's review report are files of the release beside the archive; aepm checks them, and the catalogue does not store them. Details: <a href="/docs/package-foundations.md">package foundations</a>.</p>
        <h3>Publish your composition</h3>
        <p>Once your agent has connected the parts into an application, you can publish the result as a recipe so that others pick it from the library. <a href="#publish">Publish a recipe or component</a>.</p>
      `,
    },
    {
      id: "publish",
      title: "Publish a recipe or component",
      sub: [
        { id: "publish-routes", title: "Routes" },
        { id: "publish-recipe-format", title: "The recipe.json format" },
        { id: "publish-digest", title: "The release asset digest check" },
        { id: "publish-deprecate", title: "Deprecate and undeprecate" },
      ],
      body: html`
        <p>A recipe or component is published from its own GitHub repository. ClodHub keeps a catalogue entry (name, version, descriptions, declarations, digests) and a pointer to the repository's release. The package itself stays in your release: it is the source code, one archive file (<code>.tar</code>, made by <code>aepm pack</code>) with the implementation, the contract, the tests and a manifest that lists every file with its fingerprint. A recipe's archive holds <code>recipe.json</code> and the recipe's own application code and text, and names its components by exact version without including them. Publishing needs no approval and has no queue.</p>
        <p><b>You need:</b> to be signed in (or to hold a key with the manage scope), a GitHub token saved on the <a href="/dev#credentials">developer page</a> that can push to the repository, and a GitHub release whose tag holds the package as an asset. A name is <code>scope/name</code> in lowercase letters, digits and single hyphens, and the scope must equal the repository owner. A name belongs to the first developer and repository that published it.</p>
        <h3 id="publish-routes">Routes</h3>
        <pre><code>POST   /api/dev/components               the component entry
POST   /api/dev/recipes                  the recipe entry
GET    /api/dev/components               your components, with versions and status
GET    /api/dev/recipes                  your recipes
DELETE /api/dev/components/&lt;name&gt;[/&lt;version&gt;]   unlist one version, or every version
DELETE /api/dev/recipes/&lt;name&gt;[/&lt;version&gt;]
POST   /api/dev/components/&lt;name&gt;/deprecate
POST   /api/dev/components/&lt;name&gt;/undeprecate
POST   /api/dev/recipes/&lt;name&gt;/deprecate
POST   /api/dev/recipes/&lt;name&gt;/undeprecate</code></pre>
        <p>Success is 201 <code>published</code>, or 200 <code>unchanged</code> when you send the same version with the same digest again. Errors: 400 the entry is invalid (the message lists what is wrong), 403 your GitHub account cannot push to the repository, 409 the digest differs from the one recorded for that version, the name belongs to someone else, or you have no GitHub token saved, 422 GitHub cannot see the repository, release or asset, or the asset's digest differs, 502 GitHub could not be reached. Entries that contain secret values (private key blocks, GitHub tokens, ClodHub API keys, AWS key identifiers) are refused; use references. Limits: 50 recipes and 200 components per developer, 200 versions per name, 200,000 characters in a recipe.json.</p>
        <p>The component entry is <code>{ format: 1, name, version, digest, description, category, tags, targets: { client, server }, guardians, provides, requires, dependencies, suitability, migration, source: { repository, tag }, bundle: { asset, digest } }</code>. <code>provides</code> and <code>requires</code> are lists of <code>{ id, type, version }</code> (a requirement may add <code>optional: true</code>). <code>dependencies</code> lists the exact <code>{ name, version }</code> of other components this one builds on; it is how a deprecation reaches the components and recipes above it. <code>suitability</code> and <code>migration</code> come from the package's <code>suitability.json</code> and <code>migration.json</code>.</p>
        <p>The recipe entry is:</p>
        <pre><code>{
  "format": 1,
  "recipe": { ...the recipe.json below... },
  "digest": "sha256:&lt;64 lowercase hex characters&gt;",
  "source": { "repository": "acme/poker-night-recipe", "tag": "v0.1.0" },
  "bundle": { "asset": "poker-night-0.1.0.tar", "digest": "sha256:&lt;64 lowercase hex characters&gt;" },
  "page": { "description": "Poker Night deals a hand for every member at the table.", "diagram": null, "screenshots": [] }
}</code></pre>
        <p><code>page.description</code> is text, <code>page.diagram</code> is a diagram as SVG text without scripts or outside references (or null), and <code>page.screenshots</code> are https addresses.</p>

        <h3 id="publish-recipe-format">The recipe.json format</h3>
        <pre><code>{
  "format": 1,
  "name": "acme/poker-night",
  "version": "0.1.0",
  "title": "Poker Night",
  "summary": "A card game for a club's league night, with house rules.",
  "category": "games",
  "tags": ["cards", "multiplayer"],
  "targets": { "client": ["web", "ios", "android"], "server": [] },
  "components": [
    { "id": "deck", "name": "acme/card-deck", "version": "0.1.0", "configuration": {}, "includedWhen": null },
    { "id": "tour", "name": "acme/guided-tour", "version": "0.1.0", "configuration": {}, "includedWhen": "lessons" }
  ],
  "questions": [
    { "id": "chips", "ask": "Starting chips?", "type": "integer", "default": 5000, "min": 100, "max": 1000000,
      "effects": [{ "sets": { "application.startingChips": "$answer" } }] },
    { "id": "lessons", "ask": "Lessons for new players?", "type": "boolean", "default": true, "effects": [] }
  ],
  "connections": [],
  "tests": { "defaultAnswers": {}, "answerSets": [] },
  "page": { "description": "page/description.md", "diagram": "page/diagram.svg", "screenshots": [] },
  "instructions": "INSTRUCTIONS.md"
}</code></pre>
        <ul class="bullets">
          <li><b>Components:</b> each is <code>scope/name</code> with an exact version and an instance <code>id</code>. It is included when <code>includedWhen</code> is null or true. The instance id <code>application</code> is the recipe's own component; no component is named <code>application</code>.</li>
          <li><b>Questions:</b> <code>{ id, ask, askAgent, askWhen, type, options, default, min, max, effects }</code>. The type is <code>set</code>, <code>choice</code>, <code>boolean</code>, <code>integer</code> (with <code>min</code> and <code>max</code>), <code>text</code>, <code>secretRef</code> or <code>account</code>. A question with <code>askWhen</code> needs a <code>default</code>, which it takes when the condition is false. A <code>secretRef</code> question carries no value and no default.</li>
          <li><b>Conditions</b> (<code>askWhen</code>, <code>includedWhen</code>): CEL (Common Expression Language) expressions that are true or false, such as <code>lessons</code>, <code>'ios' in targets</code> or <code>scale in ['medium', 'large']</code>. Each question id holds its answer (a set question is a list of text); a condition uses literals, question ids, <code>==</code>, <code>!=</code>, <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, <code>&gt;=</code>, <code>in</code>, <code>&amp;&amp;</code>, <code>||</code>, <code>!</code>, parentheses and <code>size()</code>.</li>
          <li><b>Effects:</b> <code>{ sets: { "&lt;componentId&gt;.&lt;settingId&gt;": value } }</code>. A value is a literal, <code>"$answer"</code>, <code>{ map }</code>, <code>{ fromScale }</code>, <code>{ template }</code> or <code>{ ref }</code>. Two questions may not set one target to different values unless their <code>askWhen</code> conditions cannot both hold.</li>
          <li><b>Jobs and scale (optional):</b> a job chooses between candidate components by suitability profile; <code>scale</code> is a choice question whose options are load bands.</li>
          <li><b>Connections:</b> each joins two <code>{ instance, port }</code> endpoints.</li>
          <li><b>Tests:</b> the default answers and named answer sets the recipe was tested with. <b>Page and instructions:</b> paths inside the package.</li>
        </ul>
        <p>The full rules are in <a href="/contract.md">contract.md</a>, and the publish check enforces them.</p>

        <h3 id="publish-digest">The release asset digest check</h3>
        <p>Every entry names a <code>bundle</code>: the release asset and its <code>sha256:</code> digest. When you publish, ClodHub uses your saved GitHub token to check that the token can push to the repository and that the release for <code>source.tag</code> holds that asset. When GitHub reports a digest for the asset, it must equal <code>bundle.digest</code>. The version is then bound to its digest: the same version with the same digest changes nothing, and the same version with a different digest is refused. Change the package and you publish a new version. When someone downloads the bundle, ClodHub reads the release again and refuses a file whose digest differs from the one recorded.</p>
        <h3 id="publish-deprecate">Deprecate and undeprecate</h3>
        <p><code>POST /api/dev/components/&lt;name&gt;/deprecate</code> (or <code>recipes</code>) flags every version of one of your names, with an optional <code>{ "replacement": "scope/name" }</code> naming a published entry of the same kind. <code>undeprecate</code> clears the flag. Both can be repeated and apply only to your own names. <code>DELETE</code> unlists versions instead: they disappear from every public page, keep their digests, and return when you publish the same version and digest again.</p>
      `,
    },
    {
      id: "deprecation",
      title: "Deprecation and what an agent does with a warning",
      sub: [
        { id: "deprecation-states", title: "Active, deprecated and orphaned" },
        { id: "deprecation-where", title: "Where a warning appears" },
        { id: "deprecation-agent", title: "What an agent does" },
      ],
      body: html`
        <h3 id="deprecation-states">Active, deprecated and orphaned</h3>
        <ul class="bullets">
          <li><b>Active:</b> nothing is flagged. A recipe that uses a flagged component is active, with a non-empty <code>deprecations</code> list.</li>
          <li><b>Deprecated:</b> the publisher flagged the name for every version, with an optional replacement. The publisher can undo it.</li>
          <li><b>Orphaned:</b> the publisher deleted their account. The entry stays listed and has no publisher and no maintainer; nobody can change it or publish to its name. Its bundle downloads only while its GitHub release is public; otherwise the bundle answer says <code>bundle-unavailable</code>.</li>
        </ul>
        <h3 id="deprecation-where">Where a warning appears</h3>
        <p>A <b>Deprecated</b> or <b>Uses deprecated parts</b> pill on lists, a banner on the entry's page, a <code>deprecations</code> list in every JSON response and bundle answer, and lines starting <code>DEPRECATION WARNING:</code> in every <code>.txt</code> page. Each element is <code>{ name, version, status, reason, since, replacement?, via }</code>; <code>via</code> names what pulls the flagged part in. To resolve a whole version at once:</p>
        <pre><code>GET /api/recipes/&lt;name&gt;/&lt;version&gt;/deprecations
-> { name, version, status, affected, checked, deprecations }</code></pre>
        <p><code>affected</code> is true when the list is not empty, and <code>checked</code> counts the distinct components examined, including ones included only for some answers. Lists and search take <code>deprecated=exclude</code>, <code>include</code> (the default) or <code>only</code>, which filters on the entry's own flag only.</p>
        <h3 id="deprecation-agent">What an agent does</h3>
        <ol class="steps">
          <li><b>Reads the warning before it builds or updates.</b> It checks <code>deprecations</code> on the recipe version and on every component it is about to use, and tells you what it found.</li>
          <li><b>Looks for the replacement.</b> When a warning names one, the agent reads that entry and compares its provided and required interfaces with the part it replaces.</li>
          <li><b>Otherwise searches</b> for other components that provide the same interface type, or for a similar recipe, with <code>deprecated=exclude</code>.</li>
          <li><b>Treats an orphaned part as unmaintained.</b> Nobody will fix it. Prefer a replacement; when the bundle is unavailable, the agent cannot fetch it.</li>
          <li><b>Leaves the choice to you.</b> An application already built keeps running. You decide whether to rebuild with a replacement or to never update.</li>
        </ol>
        <p class="small muted">Filtering with <code>deprecated=exclude</code> hides flagged entries from lists. It does not make a flagged part you already use safe, so the agent reads <code>deprecations</code> in every case.</p>
      `,
    },
    {
      id: "cloud",
      title: "Build on GitHub, with no machine of your own",
      body: html`
        <p>GitHub Actions can do the whole build from a recipe: fetch, design from your answers, resolve and install with aepm, then check, release and update the application. You, or an agent with the GitHub CLI, take these steps in your repository. The full steps, with every secret name: <a href="/cloud-assembly.md">cloud-assembly.md</a>.</p>
        <ol class="steps">
          <li><b>Create a private repository</b> and allow GitHub Actions to create pull requests (Settings, Actions, General).</li>
          <li><b>Add three files:</b> <code>answers.json</code> (the answers to the recipe's questions; the design must include the <code>ourapps-release</code> component, for OurPoker <code>publish</code> or <code>releases</code> yes), <code>CHANGELOG.md</code>, and <code>.github/workflows/aepm-assemble.yml</code>, a copy of <a href="/aepm-assemble.yml">/aepm-assemble.yml</a>.</li>
          <li><b>Add the secrets:</b> <code>AEPM_OWNER_KEY</code> (your owner key, which approves updates), <code>AEPM_PUSH_TOKEN</code> (a fine-grained token for the repository with Contents and Workflows write), and for publishing the Cloudflare, Android signing and ourapps.app credentials your answers name.</li>
          <li><b>Run aepm-assemble</b> with the recipe and version, for example <code>ourpoker@0.7.0</code>. It commits the application to main.</li>
        </ol>
        <p>The application then carries its workflows: <code>ci-server</code>, <code>ci-web</code> (a browser plays a hand against a server on the runner), <code>ci-android</code> (an emulator shows the room list), <code>apple-builds</code> (unsigned iPhone, iPad, Mac and Apple TV builds on a macOS runner, on a version tag or by hand), <code>release</code> (on a version tag) and <code>aepm-update</code> (weekly and by hand, it proposes the newest recipe version as a pull request; merging it approves the update with <code>AEPM_OWNER_KEY</code> and applies it).</p>
        <p class="small muted">Apple apps build only on macOS runners. These workflows are checked with actionlint.</p>
      `,
    },
    {
      id: "free-tiers",
      title: "Free services: why small apps cost nothing to run",
      sub: CATEGORIES.map((c) => ({ id: c.id, title: c.title })),
      body: freeTiersBody(),
    },
    {
      id: "account",
      title: "Sign in, the GitHub token and API keys",
      sub: [
        { id: "sign-in", title: "Sign in" },
        { id: "github-token", title: "GitHub token" },
        { id: "api-keys", title: "API keys" },
      ],
      body: html`
        <p>Reading the catalogue needs no account. Publishing needs three things, all on the <a href="/dev">developer page</a>.</p>
        <h3 id="sign-in">Sign in</h3>
        <p>Sign in with GitHub and accept the terms. ClodHub reads your public profile and your organisation memberships (scopes <code>read:user</code> and <code>read:org</code>); memberships decide who may publish classes in an organisation's scope. An organisation that restricts third-party apps is read only after you press Grant next to it on GitHub's sign-in page, or later under Settings, Applications, Authorized OAuth Apps, ClodHub. Sign-in lasts 30 days on a browser.</p>
        <h3 id="github-token">GitHub token</h3>
        <p>Publishing checks with your token that you can push to the repository and that its release holds the package, and bundle links read the release with it.</p>
        <ol class="steps">
          <li>On GitHub, open your avatar, ${kbd("Settings")}, ${kbd("Developer settings")}, ${kbd("Personal access tokens")}, ${kbd("Fine-grained tokens")}, ${kbd("Generate new token")}.</li>
          <li>Name it <b>ClodHub</b> and choose an expiry you will remember to renew. For packages owned by an organisation, choose the organisation as the resource owner.</li>
          <li><b>Repository access:</b> "Only select repositories", then pick the repositories you publish from. <b>Permissions:</b> Contents, Read-only. Metadata is added automatically.</li>
          <li>Generate, copy the token (it starts with <code>github_pat_</code>), paste it on the <a href="/dev#credentials">developer page</a> and save.</li>
        </ol>
        <h3 id="api-keys">API keys</h3>
        <p>Your publish tool or agent sends an API key as <code>Authorization: Bearer ch_...</code>. Create one per tool on the <a href="/dev#keys">developer page</a>; it is shown once. A key with the <b>manage</b> scope publishes, unlists and deprecates; a <b>read</b> key only lists. No key can create keys, change the GitHub token or delete the account; those need you in a browser.</p>
      `,
    },
    {
      id: "security",
      title: "Security",
      body: html`
        <ul class="bullets">
          <li>The GitHub token is encrypted with AES-256-GCM under a key derived for your account from a secret that exists only in the server's secret store, never in the database or the code. It is decrypted only inside a request that publishes or makes a bundle link.</li>
          <li>API keys and sign-in sessions are stored as keyed hashes; a copy of the database cannot be used to sign in or to forge a key.</li>
          <li>Changes from a browser session are refused unless they come from this site. The developer page lists your recent security events and has "Sign out everywhere".</li>
          <li>Entries that contain secret values (private key blocks, GitHub tokens, API keys, AWS key identifiers) are refused; recipes name secrets by reference.</li>
          <li>Packages are never stored here. Bundle links point at the publisher's release and expire after one hour, and aepm checks every archive's fingerprint before using it.</li>
          <li>Every response carries HSTS, a strict Content Security Policy, no-sniff and frame-deny.</li>
        </ul>
        <p class="small muted">Full statement: <a href="${SOURCE_URL}/blob/main/SECURITY.md" target="_blank" rel="noopener">SECURITY.md</a>. Found a security problem? <a href="${SOURCE_URL}/security/advisories/new" target="_blank" rel="noopener">Report it privately</a>.</p>
      `,
    },
  ];
}

// Escapes text and turns `code` spans into <code>.
function inline(text: string): Raw {
  return raw(escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>"));
}

// Host plus the last path segment, so several links to one site stay distinct.
function sourceLabel(u: string): string {
  const url = new URL(u);
  const last = url.pathname.split("/").filter(Boolean).pop();
  return last ? `${url.host.replace(/^www\./, "")}/${last}` : url.host.replace(/^www\./, "");
}

function serviceCard(s: Service): Raw {
  const badge = s.verdict === "pick" ? html`<span class="pill ok">recommended</span>` : s.verdict === "avoid" ? html`<span class="pill bad">avoid</span>` : "";
  return html`
    <details class="service" id="svc-${s.id}">
      <summary><b>${s.name}</b> ${badge} <span class="faint small">${s.plan}</span><span class="service-fits small muted">${s.fits}</span></summary>
      <div class="service-body">
        <div class="grid-2">
          <div><h4>Free allowance</h4><ul class="bullets small">${s.free.map((f) => html`<li>${inline(f)}</li>`)}</ul></div>
          <div><h4>Watch out</h4><ul class="bullets small">${s.catches.map((f) => html`<li>${inline(f)}</li>`)}</ul></div>
        </div>
        <h4>Agent setup</h4>
        <ol class="bullets small">${s.setup.map((f) => html`<li>${inline(f)}</li>`)}</ol>
        ${s.env?.length ? html`<p class="small">Secrets: ${raw(s.env.map((e) => `<code>${escapeHtml(e)}</code>`).join(", "))}</p>` : ""}
        <p class="tiny faint">Sources: ${raw(s.sources.map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(sourceLabel(u))}</a>`).join(" · "))}</p>
        ${s.verdict !== "avoid" ? html`<button type="button" class="btn sm secondary" data-copy="${servicePrompt(s)}">${icon("copy")} Copy agent prompt</button>` : ""}
      </div>
    </details>`;
}

function freeTiersBody(): Raw {
  return html`
    <p>AI coding agents make it practical to build an app for one organisation. That has a second effect that is easy to miss: <b>at a small organisation's size, the expensive parts of an app become free.</b> Video calls, realtime multiplayer servers, databases and AI all have free plans sized for small use, and a household, a club or a practice of fewer than ten people sits comfortably inside them. A larger business answers one question about its size, and the recipe chooses the provider tier that fits: it pays for the tier it needs and nothing more. A public app with the same features would pay for every service at full price.</p>
    <div class="grid-2">
      <div class="card flat"><h3>${icon("devices", "icon-20")} Video calls</h3><p class="small">LiveKit's free plan gives 5,000 participant minutes a month: about twenty one-hour calls with four people. A table game that shows every player's camera fits inside it.</p></div>
      <div class="card flat"><h3>${icon("apps", "icon-20")} Multiplayer</h3><p class="small">A four-player table on hibernating WebSockets fits about 80 hours of play a day in Cloudflare's free plan, against about 23 hours when the same game polls.</p></div>
      <div class="card flat"><h3>${icon("lock", "icon-20")} Data</h3><p class="small">Free databases hold hundreds of megabytes; a game history or a shared list for a household is kilobytes.</p></div>
      <div class="card flat"><h3>${icon("bot", "icon-20")} AI</h3><p class="small">On-device models (Apple, Android, Chrome) cost nothing per use, and free tiers cover a few hundred requests a day. Your personal AI subscription builds the app but must not power it for others; see the AI section.</p></div>
    </div>
    <h3>Rules that apply to every service</h3>
    <ul class="bullets">${PRINCIPLES.map((p) => html`<li>${inline(p)}</li>`)}</ul>
    ${callout("info", html`<p><b>For agents:</b> everything below, with full setup steps, is at <a href="/free-tiers.md">clodhub.com/free-tiers.md</a>. Each service has a <b>Copy agent prompt</b> button that tells your agent to read its section, check the current limits and wire it in. Numbers were checked on the providers' pages on ${CHECKED}; free tiers change, so the prompt asks the agent to re-check.</p>`)}
    ${CATEGORIES.map((c) => html`
      <h3 id="${c.id}" class="ft-category">${c.title}</h3>
      <p>${inline(c.why)}</p>
      ${c.practices?.length ? html`<details class="practices"><summary><b>Best practices for ${c.title.toLowerCase()}</b></summary><ul class="bullets small">${c.practices.map((p) => html`<li>${inline(p)}</li>`)}</ul></details>` : ""}
      <div class="services">${c.services.map(serviceCard)}</div>
    `)}
  `;
}

export async function guide(root: HTMLElement): Promise<void> {
  setTheme("store", "Guide · ClodHub", true);
  const me = await whoAmI();
  const list = sections();
  const body = html`
      <div class="guide">
        <nav class="toc" id="toc">
          ${list.map((s) => html`<a href="/guide#${s.id}" data-toc="${s.id}">${s.title}</a>${(s.sub ?? []).map((x) => html`<a class="sub" href="/guide#${x.id}">${x.title}</a>`)}`)}
          <hr /><a href="/agents.md">agents.md</a><a href="/contract.md">contract.md</a>
        </nav>
        <article>
          ${list.map((s) => html`<section id="${s.id}"><h2>${s.title}</h2>${s.body}</section>`)}
          <p class="small faint">Something missing or wrong? The source is public: <a href="${SOURCE_URL}/issues" target="_blank" rel="noopener">open an issue on github.com/clodhub/clodhub</a>.</p>
        </article>
      </div>
    `;
  const sub = "Finding, using and publishing recipes and components.";
  if (me && !termsPending(me)) mountShell(root, me, "Guide", body, { sub });
  else mount(root, storeFrame(html`<section style="padding:26px 0 6px"><h1>Guide</h1><p class="lead muted">${sub}</p></section>${body}`, { me }));
  const tocLinks = [...root.querySelectorAll<HTMLAnchorElement>("[data-toc]")];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        tocLinks.forEach((a) => a.classList.toggle("active", a.dataset.toc === e.target.id));
      }
    },
    { rootMargin: "-10% 0px -80% 0px" },
  );
  root.querySelectorAll("article section").forEach((s) => observer.observe(s));
  wireImages(root);
  wireCopy(root);
}
