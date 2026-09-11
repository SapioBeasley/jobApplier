import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBuiltInSearchUrl,
  collectBuiltInJobs,
} from "../src/sources/builtin/fetch";
import { parseBuiltInListPage } from "../src/sources/builtin/parser";

const fixture = fs.readFileSync(
  path.join(process.cwd(), "tests/fixtures/builtin-project-management.html"),
  "utf8",
);

const currentEmbeddedFixture = fs.readFileSync(
  path.join(process.cwd(), "tests/fixtures/builtin-current-embedded.html"),
  "utf8",
);

const now = new Date("2026-09-11T12:00:00.000Z");

describe("Built In parser", () => {
  it("maps server-rendered listing data into SourceJob records", () => {
    const jobs = parseBuiltInListPage(fixture, now);

    expect(jobs).toHaveLength(4);
    expect(jobs[0]).toMatchObject({
      source: "builtin",
      sourceJobId: "1001",
      sourceUrl: "https://builtin.com/job/senior-project-manager/1001",
      title: "Senior Project Manager",
      company: "Acme",
      description: "Lead enterprise delivery across distributed teams.",
      location: "United States",
      remoteType: "remote",
      remoteUsEligible: true,
      applicationType: "easy_apply",
      quickApply: "yes",
      applyUrl: "https://builtin.com/job/senior-project-manager/1001",
      salaryMin: 120000,
      salaryMax: 150000,
      salaryCurrency: null,
      salaryPeriod: "year",
    });
    expect(jobs[0].postedAt?.toISOString()).toBe("2026-09-10T12:00:00.000Z");
  });

  it("parses the current ItemList embedded outside an LD+JSON script", () => {
    const jobs = parseBuiltInListPage(currentEmbeddedFixture, now);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "10743679",
      title: "Project Manager - 26302",
      company: "Enverus",
      location: "United States",
      remoteType: "remote",
      remoteUsEligible: true,
      quickApply: "yes",
      applicationType: "easy_apply",
    });
  });

  it("classifies hybrid and non-US jobs conservatively", () => {
    const jobs = parseBuiltInListPage(fixture, now);

    expect(jobs[1]).toMatchObject({
      title: "Technical Program Manager",
      remoteType: "hybrid",
      remoteUsEligible: true,
      quickApply: "yes",
    });

    expect(jobs[2]).toMatchObject({
      title: "Project Coordinator",
      location: "France",
      remoteType: "remote",
      remoteUsEligible: false,
      quickApply: "yes",
    });
  });

  it("does not guess Quick/Easy Apply when the page provides no evidence", () => {
    const jobs = parseBuiltInListPage(fixture, now);

    expect(jobs[3]).toMatchObject({
      title: "Project Management Specialist",
      remoteType: "remote",
      remoteUsEligible: true,
      applicationType: "unknown",
      quickApply: "unknown",
      applyUrl: null,
    });
  });
});

describe("Built In fetch orchestration", () => {
  it("builds a remote Built In search URL for each accepted-position query", () => {
    expect(buildBuiltInSearchUrl("project manager", 2)).toBe(
      "https://builtin.com/jobs/remote?search=project%20manager&page=2",
    );
  });

  it("paginates and deduplicates without applying accepted-position filtering inside the adapter", async () => {
    const calls: string[] = [];

    const jobs = await collectBuiltInJobs({
      positions: ["project manager"],
      maxPages: 3,
      now,
      fetchPage: async (url) => {
        calls.push(url);
        return fixture;
      },
    });

    expect(jobs).toHaveLength(4);
    expect(calls).toEqual([
      "https://builtin.com/jobs/remote?search=project%20manager&page=1",
      "https://builtin.com/jobs/remote?search=project%20manager&page=2",
    ]);
  });

  it("surfaces a fetch failure to the source runner instead of returning fabricated data", async () => {
    await expect(
      collectBuiltInJobs({
        positions: ["project manager"],
        maxPages: 1,
        now,
        fetchPage: async () => {
          throw new Error("Built In unavailable");
        },
      }),
    ).rejects.toThrow("Built In unavailable");
  });
});
