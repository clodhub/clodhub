import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInterfaceType, parsePackageName, parseReference } from "../src/index.ts";

// The corpus clod keeps byte-identical in clod/tests/fixtures/ (papers/package-urls.md section 4); both suites record this sha256.
const PACKAGE_NAME_CASES_SHA256 = "968b567c05252f10fe2bfe6b727af8a93e8c6f9283abc3bf13ee65ea9d83723c";
const bytes = readFileSync(new URL("./fixtures/package-name-cases.json", import.meta.url));
const cases = JSON.parse(bytes.toString("utf8"));
const parsers = { package: parsePackageName, reference: parseReference, interface: parseInterfaceType };

describe("package name corpus", () => {
  it("is the agreed file", () => expect(createHash("sha256").update(bytes).digest("hex")).toBe(PACKAGE_NAME_CASES_SHA256));

  it("parses every case as recorded", () => {
    const wrong = cases.filter((c) => {
      const parts = parsers[c.what](c.value);
      return c.accept ? JSON.stringify(parts) !== JSON.stringify(c.parts) : parts !== null;
    });
    expect(wrong.map((c) => `${c.what} ${c.value}`)).toEqual([]);
    expect(cases.length).toBe(100);
    expect(cases.filter((c) => c.accept).length).toBe(28);
  });
});
