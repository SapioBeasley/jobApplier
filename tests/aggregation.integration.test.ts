import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runAggregation } from "../src/aggregation/aggregate";
import { normalizeSourceJob } from "../src/jobs/normalize";
import type { SourceJob } from "../src/jobs/types";
import type { SourceAdapter } from "../src/sources/types";

const tempDirs: string[] = [];

function createTempCatalog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-catalog-"));
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
  return file;
}

function sourceJob(overrides: Partial<SourceJob> = {}): SourceJob {
  return {
    source: "fixture-a",
    sourceJobId: "job-1",
    sourceUrl: "https://jobs.example.test/job-1",
    title: "Senior Project Manager",
    company: "Acme",
    location: "United States",
    remoteType: "remote",
    remoteUsEligible: true,
    applicationType: "unknown",
    quickApply: "unknown",
    ...overrides,
  };
}

function adapter(name: string, jobs: SourceJob[]): SourceAdapter {
  return {
    name,
    enabled: true,
    async fetchJobs() {
      return jobs.map((job) => ({ ...job, source: name }));
    },
  };
}

function failingAdapter(name: string): SourceAdapter {
  return {
    name,
    enabled: true,
    async fetchJobs() {
      throw new Error(`${name} unavailable`);
    },
  };
}

function seedAmbiguousCanonicalJob(
  db: Database.Database,
  id: string,
  dedupeKey: string,
  applyUrl: string,
) {
  const timestamp = Date.parse("2026-09-10T11:00:00.000Z");
  db.prepare(
    `INSERT INTO jobs (
      id, title, normalized_title, company, normalized_company,
      location, normalized_location, remote_type, remote_us_eligible,
      application_type, quick_apply, preferred_apply_url,
      first_seen_at, last_seen_at, lifecycle_status, missed_runs,
      dedupe_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "Senior Project Manager",
    "senior project manager",
    "Acme",
    "acme",
    "United States",
    "united states",
    "remote",
    1,
    "unknown",
    "unknown",
    applyUrl,
    timestamp,
    timestamp,
    "active",
    0,
    dedupeKey,
    timestamp,
    timestamp,
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("catalog aggregation persistence", () => {
  it("is idempotent for repeated source data and records updates instead of duplicates", async () => {
    const catalogPath = createTempCatalog();
    const source = adapter("fixture-a", [sourceJob()]);

    await runAggregation({
      catalogPath,
      adapters: [source],
      runId: "run-1",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    const db = new Database(catalogPath);
    const first = db.prepare("SELECT id FROM jobs").get() as { id: string };
    db.close();

    await runAggregation({
      catalogPath,
      adapters: [source],
      runId: "run-2",
      timestamp: new Date("2026-09-10T13:00:00.000Z"),
    });

    const verify = new Database(catalogPath);
    expect(
      (verify.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number })
        .count,
    ).toBe(1);
    expect(
      (verify.prepare("SELECT COUNT(*) count FROM job_sources").get() as {
        count: number;
      }).count,
    ).toBe(1);
    expect((verify.prepare("SELECT id FROM jobs").get() as { id: string }).id).toBe(
      first.id,
    );

    const secondRun = verify
      .prepare(
        "SELECT jobs_created, jobs_updated FROM source_runs WHERE run_id = 'run-2'",
      )
      .get() as { jobs_created: number; jobs_updated: number };
    expect(secondRun).toEqual({ jobs_created: 0, jobs_updated: 1 });
    verify.close();
  });

  it("keeps the canonical job ID stable when a later source adds a better apply URL", async () => {
    const catalogPath = createTempCatalog();

    await runAggregation({
      catalogPath,
      adapters: [adapter("fixture-a", [sourceJob()])],
      runId: "run-1",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    const db = new Database(catalogPath);
    const originalId = (db.prepare("SELECT id FROM jobs").get() as { id: string }).id;
    db.close();

    await runAggregation({
      catalogPath,
      adapters: [
        adapter("fixture-b", [
          sourceJob({
            sourceJobId: "better-42",
            sourceUrl: "https://better.example.test/jobs/42",
            applyUrl: "https://ats.example.test/apply/42",
          }),
        ]),
      ],
      runId: "run-2",
      timestamp: new Date("2026-09-10T13:00:00.000Z"),
    });

    const verify = new Database(catalogPath);
    const rows = verify
      .prepare("SELECT id, preferred_apply_url FROM jobs")
      .all() as { id: string; preferred_apply_url: string | null }[];
    expect(rows).toEqual([
      {
        id: originalId,
        preferred_apply_url: "https://ats.example.test/apply/42",
      },
    ]);
    expect(
      (verify.prepare("SELECT COUNT(*) count FROM job_sources").get() as {
        count: number;
      }).count,
    ).toBe(2);
    verify.close();
  });

  it("merges listings from different sources when the canonical apply URL is identical", async () => {
    const catalogPath = createTempCatalog();
    const applyUrl = "https://ats.example.test/apply/shared-77";

    await runAggregation({
      catalogPath,
      adapters: [
        adapter("fixture-a", [sourceJob({ applyUrl })]),
        adapter("fixture-b", [
          sourceJob({
            sourceJobId: "job-b-77",
            sourceUrl: "https://other.example.test/jobs/77",
            title: "Technical Project Manager",
            applyUrl,
          }),
        ]),
      ],
      runId: "run-strong-dedupe",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    const db = new Database(catalogPath);
    expect((db.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number }).count).toBe(1);
    expect(
      (db.prepare("SELECT COUNT(*) count FROM job_sources").get() as { count: number })
        .count,
    ).toBe(2);
    db.close();
  });

  it("does not merge an incoming job when the normalized fingerprint is already ambiguous", async () => {
    const catalogPath = createTempCatalog();
    const normalized = normalizeSourceJob(sourceJob({ sourceJobId: null }));
    const db = new Database(catalogPath);
    seedAmbiguousCanonicalJob(
      db,
      "job_seed_one",
      normalized.dedupeKey,
      "https://ats.example.test/apply/seed-one",
    );
    seedAmbiguousCanonicalJob(
      db,
      "job_seed_two",
      normalized.dedupeKey,
      "https://ats.example.test/apply/seed-two",
    );
    db.close();

    await runAggregation({
      catalogPath,
      adapters: [
        adapter("fixture-c", [
          sourceJob({
            sourceJobId: "ambiguous-new",
            sourceUrl: "https://third.example.test/jobs/ambiguous-new",
            applyUrl: null,
          }),
        ]),
      ],
      runId: "run-ambiguous",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    const verify = new Database(catalogPath);
    expect(
      (verify.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number })
        .count,
    ).toBe(3);
    verify.close();
  });

  it("stores only confirmed remote-US jobs in the catalog", async () => {
    const catalogPath = createTempCatalog();

    await runAggregation({
      catalogPath,
      adapters: [
        adapter("fixture-a", [
          sourceJob({ sourceJobId: "remote", sourceUrl: "https://jobs.test/remote" }),
          sourceJob({
            sourceJobId: "hybrid",
            sourceUrl: "https://jobs.test/hybrid",
            remoteType: "hybrid",
          }),
          sourceJob({
            sourceJobId: "unknown",
            sourceUrl: "https://jobs.test/unknown",
            remoteType: "unknown",
          }),
          sourceJob({
            sourceJobId: "onsite",
            sourceUrl: "https://jobs.test/onsite",
            remoteType: "onsite",
          }),
          sourceJob({
            sourceJobId: "non-us",
            sourceUrl: "https://jobs.test/non-us",
            remoteUsEligible: false,
          }),
        ]),
      ],
      runId: "run-remote-filter",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    const db = new Database(catalogPath);
    const rows = db.prepare("SELECT remote_type FROM jobs").all() as {
      remote_type: string;
    }[];
    expect(rows).toEqual([{ remote_type: "remote" }]);

    const run = db
      .prepare(
        "SELECT jobs_fetched, jobs_accepted, jobs_rejected FROM source_runs WHERE run_id = 'run-remote-filter'",
      )
      .get() as {
      jobs_fetched: number;
      jobs_accepted: number;
      jobs_rejected: number;
    };
    expect(run).toEqual({ jobs_fetched: 5, jobs_accepted: 1, jobs_rejected: 4 });
    db.close();
  });

  it("records a failed source without discarding jobs from successful sources", async () => {
    const catalogPath = createTempCatalog();

    await runAggregation({
      catalogPath,
      adapters: [
        adapter("fixture-a", [sourceJob()]),
        failingAdapter("fixture-failure"),
      ],
      runId: "run-isolation",
      timestamp: new Date("2026-09-10T12:00:00.000Z"),
    });

    const db = new Database(catalogPath);
    expect((db.prepare("SELECT COUNT(*) count FROM jobs").get() as { count: number }).count).toBe(1);

    const runs = db
      .prepare("SELECT source, status, error_message FROM source_runs ORDER BY source")
      .all() as { source: string; status: string; error_message: string | null }[];

    expect(runs[0]).toMatchObject({
      source: "fixture-a",
      status: "success",
      error_message: null,
    });
    expect(runs[1].source).toBe("fixture-failure");
    expect(runs[1].status).toBe("failed");
    expect(runs[1].error_message).toContain("fixture-failure unavailable");
    db.close();
  });
});
