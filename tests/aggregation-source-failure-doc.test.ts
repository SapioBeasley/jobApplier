import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("aggregation source failure documentation", () => {
  it("documents partial Built In failure behavior", () => {
    const doc = fs.readFileSync("docs/aggregation-source-failure.md", "utf8");
    expect(doc).toContain("If one configured seed fails");
    expect(doc).toContain("If every Built In seed fails");
  });
});
