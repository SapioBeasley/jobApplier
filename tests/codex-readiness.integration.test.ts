import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getNextJobs } from "../src/codex/jobsNext";
import { recordApplicationResult } from "../src/codex/applicationResult";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-readiness-"));
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
    INSERT INTO catalog_metadata(key, value)
      VALUES ('generated_at', '2026-09-15T00:00:00.000Z');
    INSERT INTO jobs(
      id, title, company, location, remote_type, remote_us_eligible,
      application_type, quick_apply, preferred_apply_url, lifecycle_status,
      posted_at, first_seen_at
    ) VALUES (
      'job-1', 'Project Manager', 'Example Co', 'United States', 'remote', 1,
      'easy_apply', 'yes', 'https://apply.example/job-1', 'active', 1000, 900
    );
    INSERT INTO job_sources(id, job_id, source, source_url, apply_url)
      VALUES ('source-job-1', 'job-1', 'builtin', 'https://builtin.example/job-1', 'https://apply.example/job-1');
  `);
  db.close();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Codex local readiness", () => {
  it("initializes the durable user ledger before jobs are handed to Codex", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const userPath = path.join(dir, "private", "user.sqlite");
    createCatalog(catalogPath);

    expect(fs.existsSync(userPath)).toBe(false);

    const result = await getNextJobs({
      catalogPath,
      userPath,
      refreshCatalog: async () => ({ status: "current" as const }),
    });

    expect(result.jobs.map((job) => job.jobId)).toEqual(["job-1"]);
    expect(fs.existsSync(userPath)).toBe(true);

    const user = new Database(userPath, { readonly: true, fileMustExist: true });
    const tables = user
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('job_status', 'job_status_history') ORDER BY name",
      )
      .all();
    expect(tables).toEqual([
      { name: "job_status" },
      { name: "job_status_history" },
    ]);
    user.close();
  });

  it("can durably record an outcome when the user ledger is initially absent", () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const userPath = path.join(dir, "private", "user.sqlite");
    createCatalog(catalogPath);

    const result = recordApplicationResult({
      catalogPath,
      userPath,
      jobId: "job-1",
      status: "needs_review",
      reason: "unknown required question",
      now: () => 1000,
      id: () => "history-1",
    });

    expect(result).toEqual({
      jobId: "job-1",
      status: "needs_review",
      changed: true,
    });

    const user = new Database(userPath, { readonly: true, fileMustExist: true });
    expect(
      user.prepare("SELECT job_id, status, notes FROM job_status").get(),
    ).toEqual({
      job_id: "job-1",
      status: "needs_review",
      notes: "unknown required question",
    });
    expect(
      user.prepare(
        "SELECT id, job_id, previous_status, new_status FROM job_status_history",
      ).get(),
    ).toEqual({
      id: "history-1",
      job_id: "job-1",
      previous_status: null,
      new_status: "needs_review",
    });
    user.close();
  });
});
