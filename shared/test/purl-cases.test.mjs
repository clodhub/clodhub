import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePurl } from "../src/index.ts";

// The corpus aepm keeps byte-identical in aepm/tests/fixtures/ (spec section 6a); both suites record this sha256.
const PURL_CASES_SHA256 = "22d51ef463902926c1e03d4ca94e449f3279e5a19d7b90b1947ad015a9992166";
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
    expect(cases.length).toBe(2055);
  });
});
