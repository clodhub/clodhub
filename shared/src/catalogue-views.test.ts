import { describe, expect, it } from "vitest";
import { markdownSections, packageContents, recipeUseSentence } from "./catalogue-views.js";

describe("what a package holds", () => {
  it("groups the archive's files by kind, with a few paths each, and counts the installed files by folder", () => {
    const files = ["CONTRACT.md", "LICENCE", "implementation/server/deck.ts", "implementation/web/cards.ts", "tests/web.test.ts", "interfaces/card-deck.json", "notices/a.txt", "assets/x.png"].map((path) => ({ path, executable: false }));
    const artefacts = [
      { source: "implementation/server/deck.ts", destination: "components/card-deck/server/deck.ts", executable: false, template: false },
      { source: "implementation/web/cards.ts", destination: "components/card-deck/web/cards.ts", executable: false, template: false },
    ];
    const c = packageContents({ files, artefacts });
    expect(c.files).toBe(8);
    expect(c.groups.map((g) => [g.label, g.count])).toEqual([
      ["Documents and manifests", 2],
      ["Source code", 2],
      ["Tests", 1],
      ["Interface documents", 1],
      ["Artwork and sounds", 1],
      ["Licence notices of upstream code", 1],
    ]);
    expect(c.groups[1]!.examples).toEqual(["server/deck.ts", "web/cards.ts"]);
    expect(c.installed).toEqual({ count: 2, root: "components/card-deck/", folders: [{ folder: "server", count: 1 }, { folder: "web", count: 1 }] });
  });

  it("names the top folders of an application's installed files when they share no folder", () => {
    const artefacts = ["server/src/index.ts", "web/src/main.ts", ".gitignore"].map((destination) => ({ source: destination, destination, executable: false, template: false }));
    expect(packageContents({ files: [], artefacts }).installed).toEqual({ count: 3, root: "", folders: [{ folder: "server", count: 1 }, { folder: "web", count: 1 }, { folder: "(top level)", count: 1 }] });
  });
});

describe("page text", () => {
  it("splits a description into its opening text and its level-2 sections", () => {
    expect(markdownSections("What it is.\n\nMore of it.\n\n## Examples\n\nOne.\n\n### Detail\n\nTwo.\n\n## Settings\n\nThree.")).toEqual({
      intro: "What it is.\n\nMore of it.",
      sections: [{ heading: "Examples", body: "One.\n\n### Detail\n\nTwo." }, { heading: "Settings", body: "Three." }],
    });
    expect(markdownSections("## Only\n\nA section.")).toEqual({ intro: "", sections: [{ heading: "Only", body: "A section." }] });
  });

  it("says how a recipe uses a component: its slot, what it connects and the settings it writes", () => {
    const sentence = recipeUseSentence({
      name: "acme/card-deck",
      class: { name: "acme/card-deck-class", version: "1.0.0", title: "Card deck" },
      provides: [{ id: "card-deck" }],
      requires: [{ id: "random-source" }, { id: "audit", optional: true }],
      settings: [{ id: "decks", required: false, hasDefault: true }, { id: "house", required: true, hasDefault: false }],
    });
    expect(sentence).toBe(
      "A recipe uses it through a slot of class Card deck (acme/card-deck-class 1.0.0), naming acme/card-deck as the slot's preferred component or substituting it for another component of the class. The recipe connects what it provides (card-deck) to the slots that use it. It fills what the component needs (random-source) from slots whose components provide it; audit may stay unconnected. The recipe sets decks and house; house has no default, so the recipe always sets it.",
    );
  });
});
