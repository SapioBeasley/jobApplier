import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = fs.readFileSync(
  ".github/workflows/aggregate-jobs.yml",
  "utf8",
);

describe("aggregation workflow", () => {
  it("allows manual validation before scheduled aggregation is enabled", () => {
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' || vars.ENABLE_AGGREGATION == 'true'",
    );
  });

  it("validates and verifies the exact catalog manifest before publishing", () => {
    const aggregateAt = workflow.indexOf("npm run aggregate");
    const validateAt = workflow.indexOf("npm run catalog:validate");
    const manifestAt = workflow.indexOf("npm run catalog:manifest");
    const verifyAt = workflow.indexOf("npm run catalog:verify-manifest");
    const compressAt = workflow.indexOf("gzip -9 -k -f data/catalog.sqlite");
    const publishAt = workflow.indexOf("gh release upload");

    expect(aggregateAt).toBeGreaterThan(-1);
    expect(validateAt).toBeGreaterThan(aggregateAt);
    expect(manifestAt).toBeGreaterThan(validateAt);
    expect(verifyAt).toBeGreaterThan(manifestAt);
    expect(compressAt).toBeGreaterThan(verifyAt);
    expect(publishAt).toBeGreaterThan(compressAt);
  });

  it("publishes a per-source aggregation table to the GitHub Actions step summary", () => {
    const aggregateAt = workflow.indexOf("npm run aggregate");
    const summaryAt = workflow.indexOf("Source aggregation summary");

    expect(summaryAt).toBeGreaterThan(aggregateAt);
    expect(workflow).toContain("$GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("Source | Status | Fetched | Accepted | Created | Updated | Rejected | Error");
    expect(workflow).toContain("FROM source_runs");
  });
});
