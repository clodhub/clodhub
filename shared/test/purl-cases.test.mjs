import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePurl } from "../src/index.ts";

// The corpus aepm keeps byte-identical in aepm/tests/fixtures/ (spec section 6a); both suites record this sha256.
const PURL_CASES_SHA256 = "84e429d012f0931f6db2e67f2e4d2f61b76fab24b7a23a4e2ec6ea688563b470";
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
    expect(cases.length).toBe(2069);
  });
});
