import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

const legacyRuntimePaths = [
  "src/app",
  "src/applications/cli/runQueue.ts",
  "src/applications/cli/syncQueue.ts",
  "src/applications/queue.ts",
  "src/applications/runQueue.ts",
  "src/applications/runner.ts",
  "src/applications/adapters/registry.ts",
  "src/applications/adapters/types.ts",
  "src/catalog/jobs.ts",
  "tests/jobs-ui.test.tsx",
];

describe("V1 repository boundary", () => {
  it("does not expose a repo-owned UI or application-runner command", () => {
    expect(packageJson.scripts?.dev).toBeUndefined();
    expect(packageJson.scripts?.start).toBeUndefined();
    expect(packageJson.scripts?.["queue:sync"]).toBeUndefined();
    expect(packageJson.scripts?.["queue:run"]).toBeUndefined();

    for (const legacyPath of legacyRuntimePaths) {
      expect(fs.existsSync(path.join(root, legacyPath)), legacyPath).toBe(false);
    }
  });

  it("keeps only the runtime dependencies needed by the CLI/aggregation V1", () => {
    for (const dependency of ["next", "react", "react-dom", "puppeteer"]) {
      expect(packageJson.dependencies?.[dependency], dependency).toBeUndefined();
    }
  });

  it("retains the two Codex-facing durable-state commands", () => {
    expect(packageJson.scripts?.["jobs:next"]).toBe(
      "tsx scripts/jobs-next.ts",
    );
    expect(packageJson.scripts?.["application:result"]).toBe(
      "tsx scripts/application-result.ts",
    );
  });
});
