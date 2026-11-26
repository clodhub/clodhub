import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePurl } from "../src/index.ts";

// The corpus clod keeps byte-identical in clod/tests/fixtures/ (papers/package-urls.md section 3); both suites record this sha256.
const PURL_CASES_SHA256 = "c3943eda2a8175f40f9021fed195c2cbb12ca9bd8e2837742342c6bbc65b5601";
const bytes = readFileSync(new URL("./fixtures/purl-cases.json", import.meta.url));
const cases = JSON.parse(bytes.toString("utf8"));

describe("package URL corpus", () => {
  it("is the agreed file", () => expect(createHash("sha256").update(bytes).digest("hex")).toBe(PURL_CASES_SHA256));

  it("parses every case as recorded", () => {
    const wrong = cases.filter((c) => {
      const parts = parsePurl(c.purl);
      return c.accept ? JSON.stringify(parts) !== JSON.stringify(c.parts) : parts !== null;
    });
    expect(wrong.map((c) => c.purl)).toEqual([]);
    expect(cases.length).toBe(2076);
    expect(cases.filter((c) => c.accept).length).toBe(1909);
  });
});
