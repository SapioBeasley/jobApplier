import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWellfoundSearchUrl, collectWellfoundJobs } from "../src/sources/wellfound/fetch";
import { parseWellfoundListPage } from "../src/sources/wellfound/parser";

const fixture = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/wellfound-project-management.html"), "utf8");
const renderedCardsFixture = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/wellfound-rendered-cards.html"), "utf8");

describe("Wellfound parser", () => {
  it("maps structured Wellfound jobs conservatively into SourceJob records", () => {
    const jobs = parseWellfoundListPage(fixture);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      source: "wellfound",
      sourceJobId: "4644413",
      sourceUrl: "https://wellfound.com/jobs/4644413-technical-project-manager",
      title: "Technical Project Manager",
      company: "FutureFit AI",
      remoteType: "remote",
      remoteUsEligible: true,
      salaryMin: 125000,
      salaryMax: 165000,
      salaryCurrency: "USD",
      salaryPeriod: "year",
      quickApply: "yes",
      applicationType: "quick_apply",
      applyUrl: "https://wellfound.com/jobs/4644413-technical-project-manager",
    });
  });

  it("parses current rendered listing cards when JobPosting JSON-LD is absent", () => {
    const jobs = parseWellfoundListPage(renderedCardsFixture);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      source: "wellfound",
      sourceJobId: "4677983",
      sourceUrl: "https://wellfound.com/jobs/4677983-technical-project-manager",
      title: "Technical Project Manager",
      company: "SprintFWD",
      remoteType: "remote",
      remoteUsEligible: true,
      quickApply: "unknown",
      applicationType: "unknown",
      applyUrl: null,
    });
  });

  it("keeps rendered worldwide and location-only listings out of remote-US eligibility", () => {
    const jobs = parseWellfoundListPage(renderedCardsFixture);
    expect(jobs[1]).toMatchObject({ company: "Gunpowder Innovations", remoteType: "remote", remoteUsEligible: false });
    expect(jobs[2]).toMatchObject({ company: "Scope Labs", remoteType: "unknown", remoteUsEligible: false });
  });

  it("does not treat worldwide remote eligibility as confirmed US eligibility", () => {
    const jobs = parseWellfoundListPage(fixture);
    expect(jobs[1]).toMatchObject({ remoteType: "remote", remoteUsEligible: false, quickApply: "unknown", applicationType: "unknown", applyUrl: null });
  });

  it("does not classify an onsite US listing as remote", () => {
    const jobs = parseWellfoundListPage(fixture);
    expect(jobs[2]).toMatchObject({ remoteType: "onsite", remoteUsEligible: false, quickApply: "unknown", applicationType: "unknown" });
  });

  it("ignores malformed structured data rather than fabricating jobs", () => {
    expect(parseWellfoundListPage('<script type="application/ld+json">{broken</script>')).toEqual([]);
  });
});

describe("Wellfound fetch orchestration", () => {
  it("builds paginated remote role URLs", () => {
    expect(buildWellfoundSearchUrl("technical project manager", 2)).toBe("https://wellfound.com/role/r/technical-project-manager?page=2");
  });

  it("paginates and deduplicates source jobs", async () => {
    const calls: string[] = [];
    const jobs = await collectWellfoundJobs({ positions: ["technical project manager"], maxPages: 2, fetchPage: async (url) => { calls.push(url); return fixture; } });
    expect(jobs).toHaveLength(3);
    expect(calls).toEqual(["https://wellfound.com/role/r/technical-project-manager?page=1", "https://wellfound.com/role/r/technical-project-manager?page=2"]);
  });

  it("continues pagination for rendered listing pages", async () => {
    const calls: string[] = [];
    const jobs = await collectWellfoundJobs({ positions: ["project manager"], maxPages: 2, fetchPage: async (url) => { calls.push(url); return renderedCardsFixture; } });
    expect(jobs).toHaveLength(3);
    expect(calls).toHaveLength(2);
  });

  it("surfaces total source failure instead of returning fabricated data", async () => {
    await expect(collectWellfoundJobs({ positions: ["project manager"], maxPages: 1, fetchPage: async () => { throw new Error("Wellfound unavailable"); } })).rejects.toThrow("Wellfound unavailable");
  });
});
