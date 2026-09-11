import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

describe("CI workflow", () => {
  it("uses the project completion gate", () => {
    expect(workflow).toContain("run: npm run check");
  });
});
