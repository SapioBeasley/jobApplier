import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectBuiltInJobs } from "../src/sources/builtin/fetch";

const fixture = fs.readFileSync(
  path.join(process.cwd(), "tests/fixtures/builtin-project-management.html"),
  "utf8",
);

const now = new Date("2026-09-15T12:00:00.000Z");

describe("Built In pagination coverage", () => {
  it("uses the bounded 10-page default while still allowing duplicate-tail early stop", async () => {
    const calls: string[] = [];

    await collectBuiltInJobs({
      positions: ["project manager"],
      now,
      fetchPage: async (url) => {
        calls.push(url);
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        return fixture.replaceAll("1001", String(10_000 + page));
      },
    });

    expect(calls).toHaveLength(10);
    expect(calls[0]).toContain("page=1");
    expect(calls[9]).toContain("page=10");
  });
});
