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
  it("uses the bounded 50-page default while still allowing duplicate-tail early stop", async () => {
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

    expect(calls).toHaveLength(50);
    expect(calls[0]).toContain("page=1");
    expect(calls[49]).toContain("page=50");
  });

  it("continues with other search seeds when one seed request fails", async () => {
    const jobs = await collectBuiltInJobs({
      positions: ["project manager", "program manager"],
      maxPages: 1,
      now,
      fetchPage: async (url) => {
        if (url.includes("project%20manager")) {
          throw new Error("simulated source request failure");
        }
        return fixture;
      },
    });

    expect(jobs.length).toBeGreaterThan(0);
  });

  it("fails closed when every search seed fails", async () => {
    await expect(
      collectBuiltInJobs({
        positions: ["project manager", "program manager"],
        maxPages: 1,
        now,
        fetchPage: async () => {
          throw new Error("simulated source request failure");
        },
      }),
    ).rejects.toThrow("All Built In search seeds failed");
  });
});
