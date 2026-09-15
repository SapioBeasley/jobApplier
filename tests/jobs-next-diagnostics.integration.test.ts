import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getNextJobs } from "../src/codex/jobsNext";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-diagnostics-"));
  tempDirs.push(dir);
  return dir;
}

function createCatalog(file: string) {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      remote_type TEXT NOT NULL,
      remote_us_eligible INTEGER NOT NULL,
      application_type TEXT NOT NULL,
      quick_apply TEXT NOT NULL,
      preferred_apply_url TEXT,
      lifecycle_status TEXT NOT NULL,
      posted_at INTEGER,
      first_seen_at INTEGER NOT NULL
    );
    CREATE TABLE job_sources (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      apply_url TEXT
    );
  `);

  const insert = db.prepare(`
    INSERT INTO jobs(
      id, title, company, location, remote_type, remote_us_eligible,
      application_type, quick_apply, preferred_apply_url, lifecycle_status,
      posted_at, first_seen_at
    ) VALUES (?, ?, 'Example Co', 'United States', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const source = db.prepare(`
    INSERT INTO job_sources(id, job_id, source, source_url, apply_url)
    VALUES (?, ?, 'builtin', ?, ?)
  `);

  const rows = [
    ["eligible", "Project Manager", "remote", 1, "easy_apply", "yes", "https://apply.example/eligible", "active", 700, 700],
    ["unknown-quick", "Project Manager", "remote", 1, "unknown", "unknown", "https://apply.example/unknown", "active", 600, 600],
    ["onsite", "Project Manager", "onsite", 1, "easy_apply", "yes", "https://apply.example/onsite", "active", 500, 500],
    ["not-us", "Project Manager", "remote", 0, "easy_apply", "yes", "https://apply.example/not-us", "active", 400, 400],
    ["missing-url", "Project Manager", "remote", 1, "easy_apply", "yes", null, "active", 300, 300],
    ["review", "Project Manager", "remote", 1, "easy_apply", "yes", "https://apply.example/review", "active", 200, 200],
  ] as const;

  for (const row of rows) {
    insert.run(...row);
    source.run(`source-${row[0]}`, row[0], `https://source.example/${row[0]}`, row[6]);
  }
  db.close();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("jobs:next diagnostics", () => {
  it("reports the eligibility funnel and durable-status exclusions", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const userPath = path.join(dir, "user.sqlite");
    createCatalog(catalogPath);

    const user = new Database(userPath);
    user.exec(`
      CREATE TABLE job_status (
        job_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO job_status(job_id, status, updated_at)
        VALUES ('review', 'needs_review', 1);
    `);
    user.close();

    const result = await getNextJobs({
      catalogPath,
      userPath,
      limit: 10,
      refreshCatalog: async () => ({ status: "current" as const }),
    });

    expect(result.jobs.map((job) => job.jobId)).toEqual(["eligible"]);
    expect(result.diagnostics).toEqual({
      totalEvaluated: 6,
      totalEligible: 1,
      totalReturned: 1,
      ineligibleReasonCounts: {
        durable_needs_review: 1,
        missing_application_url: 1,
        not_confirmed_quick_apply: 1,
        not_remote: 1,
        not_remote_us_eligible: 1,
        unsupported_application_type: 1,
      },
    });
  });
});
