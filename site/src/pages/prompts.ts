// The prompt the developer page offers to paste into a coding agent.

export function AGENT_RECIPE_PROMPT(): string {
  return `You build applications for me from the recipes and components at https://clodhub.com. Names are package URLs such as pkg:clod/com.clodhub/ourpoker-recipe; clod takes the short form ourpoker-recipe@0.13.0 for the com.clodhub namespace. A recipe asks questions and names the reviewed components an application is made from; a component is a reviewed part with a contract.

Finding things (no key needed):
- Search recipes: GET https://clodhub.com/api/recipes?q=... ; components: GET https://clodhub.com/api/components?q=... (filters: category, class, platform, quality, certified, channel, secure=true, provides, requires).
- Read a recipe: https://clodhub.com/recipes/<name>.txt (plain text) or GET /api/recipes/<name>/latest (JSON). Read a component: https://clodhub.com/components/<name>.txt or GET /api/components/<name>/latest. Every response carries a deprecations list; if it is not empty, tell me before going on.
- Download: GET /api/recipes/<name>/<version>/bundle and GET /api/components/<name>/<version>/bundle return a link, valid for one hour, to the package and its digest. Check the digest before you open anything. Each package's source is a public repository at https://github.com/<owner>/<name>, the owner being its namespace's owner (clodhub for com.clodhub).

Tools:
- clod packs, resolves, reviews, installs, verifies and updates packages. Get it from https://github.com/clodhub/clod (needs Python 3.12, Node.js and Graphviz): git clone https://github.com/clodhub/clod && CLOD="$PWD/clod" && clod() { PYTHONPATH="$CLOD" python3 -B -m clod "$@"; } defines the clod command in bash or zsh. It runs no package code during installation.
- clod's commands are fetch, questions, design, alternatives, doctor, resolve, install, verify, review, propose-update, approve, apply, recover, pack, inspect, bom, sign, export, execution-request and authorize-execution (clod --help lists them). There is no single command that assembles an application, and no published tool that scaffolds or checks a component; do not invent or claim one.

Building from a recipe (the recipe's .txt page lists the same steps):
1. Get clod as above. Then: clod fetch <recipe>@<version> --with-dependencies --store store (checks every digest and signature).
2. clod questions <recipe>@<version> --store store. Answer from what I have said; ask me only what my description leaves open. Never invent a secret, an account name or an address; secrets are named by reference, never written as values. Write answers.json.
3. clod design <recipe>@<version> --store store --answers answers.json --out definition.json, then clod resolve. Show me the components and settings the design chose before installing.
4. Make policy.json from https://clodhub.com/policy/levelnpolicy.json plus an owner key (INSTRUCTIONS.md in the recipe archive shows how), then clod install ... --target app.
5. Build and run as INSTRUCTIONS.md section "Build and run" says, for the devices I chose. Report what was built, what was not, and what I must do myself (accounts, tokens, store setup).

Rules: do not install a component that is not named by the recipe or by me. Do not claim something runs that you have not run. Keep replies short.`;
}
