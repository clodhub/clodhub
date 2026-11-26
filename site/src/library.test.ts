import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "@clodhub/shared";
import { answerText, conditionHtml, costLabel, includedWhenHtml, loadText, paragraphsOf, queryString, readQuery, releaseUrl, targetLabel, versionFromSearch, withFilter } from "./library.js";
import { termsBody } from "./pages/terms.js";
import { storeFrame } from "./pages/public.js";
import { html } from "./html.js";

describe("library query", () => {
  it("reads filters, search, sort and cursor and ignores the rest", () => {
    expect(readQuery("?q=poker&category=games/cards&platform=ios&quality=reviewed&certified=true&channel=security&secure=true&licence=MIT&sort=trending&cursor=abc&x=1")).toEqual({ q: "poker", category: "games/cards", platform: "ios", quality: "reviewed", certified: "true", channel: "security", secure: "true", licence: "MIT", sort: "trending", cursor: "abc" });
    expect(readQuery("?provides=com.clodhub/card-deck&requires=com.clodhub/random-source")).toEqual({ provides: ["com.clodhub/card-deck"], requires: ["com.clodhub/random-source"] });
    expect(readQuery("")).toEqual({});
    expect(readQuery("?category=%20&certified=maybe&secure=false")).toEqual({});
  });

  it("reads the deprecated filter and ignores include and unknown values", () => {
    expect(readQuery("?deprecated=exclude")).toEqual({ deprecated: "exclude" });
    expect(readQuery("?deprecated=only&category=games")).toEqual({ deprecated: "only", category: "games" });
    expect(readQuery("?deprecated=include")).toEqual({});
    expect(readQuery("?deprecated=maybe")).toEqual({});
    expect(queryString({ deprecated: "only" })).toBe("?deprecated=only");
    expect(withFilter({ deprecated: "only" }, "deprecated", "only")).toEqual({});
  });

  it("writes a canonical query string", () => {
    expect(queryString({})).toBe("");
    expect(queryString({ category: "games", q: "poker night", cursor: "x1" })).toBe("?q=poker+night&category=games&cursor=x1");
    expect(queryString({ provides: ["com.clodhub/card-deck"] })).toBe("?provides=com.clodhub%2Fcard-deck");
    expect(queryString({ provides: ["com.clodhub/card-deck", "com.clodhub/seating"] })).toBe("?provides=com.clodhub%2Fcard-deck&provides=com.clodhub%2Fseating");
  });

  it("changes one filter, toggles it off and restarts paging", () => {
    expect(withFilter({ category: "games", cursor: "x1" }, "platform", "ios")).toEqual({ category: "games", platform: "ios" });
    expect(withFilter({ category: "games" }, "category", "games")).toEqual({});
    expect(withFilter({ category: "games", q: "x" }, "category", undefined)).toEqual({ q: "x" });
    expect(withFilter({ provides: ["com.clodhub/card-deck"] }, "provides", "com.clodhub/seating")).toEqual({ provides: ["com.clodhub/card-deck", "com.clodhub/seating"] });
    expect(withFilter({ provides: ["com.clodhub/card-deck", "com.clodhub/seating"] }, "provides", "com.clodhub/card-deck")).toEqual({ provides: ["com.clodhub/seating"] });
    expect(readQuery("?provides=com.clodhub/card-deck&provides=com.clodhub/seating")).toEqual({ provides: ["com.clodhub/card-deck", "com.clodhub/seating"] });
  });

  it("picks the version from the address", () => {
    expect(versionFromSearch("?version=0.2.0")).toBe("0.2.0");
    expect(versionFromSearch("")).toBe("latest");
    expect(versionFromSearch("?version=../x")).toBe("latest");
    expect(versionFromSearch("?version=1.2")).toBe("latest");
  });
});

describe("library wording", () => {
  it("names targets for people", () => {
    expect(targetLabel("ios")).toBe("iPhone and iPad");
    expect(targetLabel("tvos")).toBe("Apple TV");
    expect(targetLabel("hosting-provider")).toBe("Hosting provider");
    expect(targetLabel("other")).toBe("other");
  });

  it("describes loads and costs", () => {
    expect(loadText({})).toBe("no practical limit");
    expect(loadText({ concurrentPeople: 10, requestsPerDay: 100000, storedMegabytes: 1024 })).toBe("up to 10 people at once, 100,000 requests a day, 1,024 MB stored");
    expect(loadText({ seats: 4 })).toBe("up to seats 4");
    expect(costLabel("metered")).toBe("Metered");
    expect(costLabel("none")).toBe("No cost");
  });

  it("describes answers and conditions", () => {
    expect(answerText(undefined)).toBe("asked");
    expect(answerText(null)).toBe("asked");
    expect(answerText(true)).toBe("yes");
    expect(answerText(["web", "ios"])).toBe("web, ios");
    expect(answerText([])).toBe("none");
    expect(answerText(5000)).toBe("5000");
    expect(includedWhenHtml({ includedWhen: null }).html).toBe("always");
    expect(includedWhenHtml({ includedWhen: "lessons" }).html).toBe("when lessons is yes");
    expect(includedWhenHtml({ includedWhen: "lessons == true" }).html).toBe("when lessons is yes");
    expect(includedWhenHtml({ includedWhen: "scale in ['small', 'medium']" }).html).toBe("when scale is one of small, medium");
    expect(includedWhenHtml({ includedWhen: "lessons && !('web' in targets)" }).html).toBe("when (lessons is yes) and (targets does not include web)");
    expect(includedWhenHtml({ includedWhen: "'ios' in targets || 'macos' in targets" }).html).toBe("when (targets includes ios) or (targets includes macos)");
    expect(includedWhenHtml({ includedWhen: "'ios' in targets" }).html).toBe("when targets includes ios");
    expect(includedWhenHtml({ includedWhen: "size(languages) > 1" }).html).toBe("when <code>size(languages) &gt; 1</code>");
    expect(conditionHtml("players >= 4 && video").html).toBe("(players is at least 4) and (video is yes)");
  });

  it("links to the release and splits paragraphs", () => {
    expect(releaseUrl("acme/card-deck", "v0.1.0")).toBe("https://github.com/acme/card-deck/releases/tag/v0.1.0");
    expect(releaseUrl("acme/x", "rel/1")).toBe("https://github.com/acme/x/releases/tag/rel%2F1");
    expect(paragraphsOf("One.\r\n\r\nTwo.\n\n\n  \nThree")).toEqual(["One.", "Two.", "Three"]);
  });
});

describe("public copy", () => {
  it("terms describe the library and catalogue", () => {
    const text = termsBody().html;
    expect(text).toContain("public catalogue of recipes");
    expect(text).toContain("it does not keep the packages");
    expect(text).toContain("Recipes, components and classes you publish");
    expect(text).toContain(`Version ${TERMS_VERSION}`);
  });

  it("terms list the organisation memberships read at sign-in, in a version after they were first stored", () => {
    const text = termsBody().html;
    expect(text).toContain("The GitHub organisations you are an active member of, read at each sign-in");
    expect(text).not.toContain("public profile only");
    expect(TERMS_VERSION >= "2026-11-20").toBe(true);
    expect(text).toContain("Build reports the catalogue's curators publish about a recipe");
    expect(text).not.toContain("name no person");
    expect(text).toContain("until the end of that day (UTC); it is deleted within the following hour");
    expect(text).not.toContain("for that day only");
  });

  it("the terms version is a date", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
  });

  it("the public frame keeps the copyright, links the catalogue and says what is public", () => {
    const page = storeFrame(html`<p>x</p>`).html;
    expect(page).toContain("Copyright Level N Ltd 2026");
    expect(page).toContain('href="/recipes"');
    expect(page).toContain('href="/components"');
    expect(page).toContain("The catalogue is public");
  });
});

describe("one story across the pages", () => {
  const sources = import.meta.glob(["./pages/*.ts", "../index.html", "../public/agents.md", "../public/llms.txt", "../public/cloud-assembly.md", "../public/clod-assemble.yml"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const read = (file: string) => {
    const text = sources[file];
    if (text === undefined) throw new Error(`${file} not found`);
    return text;
  };

  it("the guide opens with recipes and components and holds no delivery steps", () => {
    const guide = read("./pages/guide.ts");
    const ids = [...guide.matchAll(/^ {6}id: "([a-z-]+)",$/gm)].map((m) => m[1]);
    expect(ids.slice(0, 5)).toEqual(["how-it-works", "find-recipe", "compose", "publish", "deprecation"]);
    for (const id of ["add-app", "release", "share", "testflight"]) expect(ids).not.toContain(id);
  });

  it("no page or document tells the old story or names the old scope", () => {
    const files = ["./pages/public.ts", "./pages/guide.ts", "./pages/small.ts", "./pages/shell.ts", "./pages/dev.ts", "./pages/prompts.ts", "./pages/terms.ts", "./pages/library.ts", "../index.html", "../public/agents.md", "../public/llms.txt", "../public/cloud-assembly.md", "../public/clod-assemble.yml"];
    for (const file of files) {
      const text = read(file);
      for (const old of ["friends and family", "private app store", "ourapps-" + "ae", "ourapps console", "Our Agentically-Engineered", "ae" + "pm", "AE" + "PM", "ae" + "/"]) expect(text, `${file}: ${old}`).not.toContain(old);
    }
  });

  it("the landing page says in plain words what ClodHub is", () => {
    const landing = read("./pages/public.ts");
    for (const text of ["ClodHub is a catalogue of reviewed components and recipes", "clod fetch ourpoker-recipe@", "Browse recipes", "Browse components"]) expect(landing, text).toContain(text);
    const small = read("./pages/small.ts");
    expect(small).toContain("At a small organisation's size, the expensive parts are free");
    expect(small).toContain("Choose free or paid by size");
  });

  it("building on GitHub is linked from the guide and the agent documents and claims only what is checked", () => {
    for (const file of ["./pages/guide.ts", "../public/agents.md", "../public/llms.txt"]) expect(read(file), file).toContain("/cloud-assembly.md");
    const doc = read("../public/cloud-assembly.md");
    for (const text of ["CLOD_OWNER_KEY", "CLOD_PUSH_TOKEN", "OURPOKER_CLOUDFLARE_ACCOUNT_API_TOKEN", "OURPOKER_STORE_CREDENTIALS_BUILD_TOKEN", "ci-server", "ci-web", "ci-android", "apple-builds", "release", "clod-update", "Allow GitHub Actions to create and approve pull requests", "build only on macOS runners", "These workflows are checked with actionlint", "Copyright Level N Ltd 2026"]) expect(doc, text).toContain(text);
    expect(doc).not.toMatch(/ran on GitHub|run on GitHub's runners|tested on GitHub/);
    const workflow = read("../public/clod-assemble.yml");
    for (const step of ["clod fetch", "clod design", "--answers answers.json", "clod resolve", "levelnpolicy.json", "clod install", "secrets.CLOD_OWNER_KEY", "secrets.CLOD_PUSH_TOKEN"]) expect(workflow, step).toContain(step);
  });

  it("the signed-in sidebar links the recipes and components", () => {
    const shell = read("./pages/shell.ts");
    expect(shell).toContain('href: "/recipes"');
    expect(shell).toContain('href: "/components"');
  });
});

describe("the clod package URL type definition", () => {
  const files = import.meta.glob("../public/purl/clod-definition.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("is the shared file of papers/package-urls, byte for byte", async () => {
    const text = files["../public/purl/clod-definition.json"]!;
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(digest).toBe("c9e824cc5a80d9dfd1186eb6b8b14f4fa35cd1101668dca0b259b3cabee652f1");
    expect(JSON.parse(text)).toMatchObject({ type: "clod", repository: { default_repository_url: "https://clodhub.com" } });
  });
});
