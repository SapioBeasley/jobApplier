import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runAggregation } from "../src/aggregation/aggregate";
import {
  generateCatalogManifest,
  verifyCatalogManifest,
} from "../src/aggregation/manifest";
import { validateCatalog } from "../src/aggregation/validate";
import type { SourceJob } from "../src/jobs/types";
import type { SourceAdapter } from "../src/sources/types";

const tempDirs: string[] = [];

function createTempCatalog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-publication-"));
  tempDirs.push(dir);
  const file = path.join(dir, "catalog.sqlite");
  const db = new Database(file);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      company TEXT NOT NULL,
      normalized_company TEXT NOT NULL,
      company_url TEXT,
      description TEXT,
      requirements TEXT,
      location TEXT,
      normalized_location TEXT,
      remote_type TEXT NOT NULL DEFAULT 'remote',
      remote_restrictions TEXT,
      remote_us_eligible INTEGER NOT NULL DEFAULT 1,
      employment_type TEXT,
      seniority TEXT,
      salary_min REAL,
      salary_max REAL,
      salary_currency TEXT,
      salary_period TEXT,
      application_type TEXT NOT NULL DEFAULT 'unknown',
      quick_apply TEXT NOT NULL DEFAULT 'unknown',
      preferred_apply_url TEXT,
      posted_at INTEGER,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'active',
      missed_runs INTEGER NOT NULL DEFAULT 0,
      dedupe_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE job_sources (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      source_job_id TEXT,
      source_url TEXT NOT NULL,
      apply_url TEXT,
      raw_data TEXT,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX job_sources_source_source_job_id_uq
      ON job_sources(source, source_job_id);

    CREATE TABLE source_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      source TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT NOT NULL,
      jobs_fetched INTEGER NOT NULL DEFAULT 0,
      jobs_accepted INTEGER NOT NULL DEFAULT 0,
      jobs_created INTEGER NOT NULL DEFAULT 0,
      jobs_updated INTEGER NOT NULL DEFAULT 0,
      jobs_rejected INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );

    CREATE TABLE catalog_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.close();
  return { dir, file };
}

function sourceJob(): SourceJob {
  return {
    source: "fixture-success",
    sourceJobId: "job-1",
    sourceUrl: "https://jobs.example.test/job-1",
    title: "Senior Project Manager",
    company: "Acme",
    location: "United States",
    remoteType: "remote",
    remoteUsEligible: true,
    applicationType: "unknown",
    quickApply: "unknown",
  };
}

function successfulAdapter(): SourceAdapter {
  return {
    name: "fixture-success",
    enabled: true,
    async fetchJobs() {
      return [sourceJob()];
    },
  };
}

function failingAdapter(): SourceAdapter {
  return {
    name: "fixture-failure",
    enabled: true,
    async fetchJobs() {
      throw new Error("fixture source unavailable");
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("catalog publication validation", () => {
  it("accepts a healthy catalog whose latest run has a successful source", async () => {
    const { file } = createTempCatalog();

    await runAggregation({
      catalogPath: file,
      adapters: [successfulAdapter()],
      runId: "healthy-run",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    expect(validateCatalog(file)).toMatchObject({
      ok: true,
      jobCount: 1,
      sourceCount: 1,
      latestRunId: "healthy-run",
      successfulLatestSources: 1,
    });
  });

  it("rejects publication when every source in the latest run failed", async () => {
    const { file } = createTempCatalog();

    await runAggregation({
      catalogPath: file,
      adapters: [successfulAdapter()],
      runId: "previous-good-run",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    await runAggregation({
      catalogPath: file,
      adapters: [failingAdapter()],
      runId: "latest-broken-run",
      timestamp: new Date("2026-09-10T13:00:00.000Z"),
    });

    expect(() => validateCatalog(file)).toThrow(
      "Latest aggregation run has no successful sources",
    );
  });

  it("rejects an empty catalog instead of publishing a destructive empty snapshot", () => {
    const { file } = createTempCatalog();
    const db = new Database(file);
    db.prepare("INSERT INTO catalog_metadata(key, value) VALUES ('last_run_id', ?)").run(
      "empty-run",
    );
    db.prepare("INSERT INTO catalog_metadata(key, value) VALUES ('generated_at', ?)").run(
      "2026-09-10T12:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO source_runs(
        id, run_id, source, started_at, completed_at, status,
        jobs_fetched, jobs_accepted, jobs_created, jobs_updated, jobs_rejected
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)`,
    ).run(
      "run-empty",
      "empty-run",
      "fixture-success",
      Date.parse("2026-09-10T12:00:00.000Z"),
      Date.parse("2026-09-10T12:00:00.000Z"),
      "success",
    );
    db.close();

    expect(() => validateCatalog(file)).toThrow("Catalog contains no jobs");
  });

  it("generates a manifest from catalog metadata and verifies the exact database SHA-256", async () => {
    const { file } = createTempCatalog();

    await runAggregation({
      catalogPath: file,
      adapters: [successfulAdapter()],
      runId: "manifest-run",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    const manifest = generateCatalogManifest(file);
    const expectedSha = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-09-10T12:00:00.000Z",
      runId: "manifest-run",
      jobCount: 1,
      activeJobCount: 1,
      sourceCount: 1,
      sha256: expectedSha,
      database: "catalog.sqlite.gz",
    });
    expect(verifyCatalogManifest(file, manifest)).toBe(true);

    const db = new Database(file);
    db.prepare("UPDATE jobs SET title = ?").run("Changed after manifest generation");
    db.close();

    expect(() => verifyCatalogManifest(file, manifest)).toThrow(
      "Catalog SHA-256 mismatch",
    );
  });
});
