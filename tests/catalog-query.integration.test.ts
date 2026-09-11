import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getCatalogJob, listCatalogJobs } from "../src/catalog/jobs";

const tempDirs: string[] = [];

function createCatalog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-jobs-"));
  tempDirs.push(dir);
  const file = path.join(dir, "catalog.sqlite");
  const db = new Database(file);
  db.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      company TEXT NOT NULL,
      normalized_company TEXT NOT NULL,
      description TEXT,
      requirements TEXT,
      location TEXT,
      remote_type TEXT NOT NULL,
      remote_us_eligible INTEGER NOT NULL,
      application_type TEXT NOT NULL,
      quick_apply TEXT NOT NULL,
      preferred_apply_url TEXT,
      lifecycle_status TEXT NOT NULL,
      posted_at INTEGER,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE job_sources (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      apply_url TEXT
    );
  `);

  const insertJob = db.prepare(`
    INSERT INTO jobs(
      id, title, normalized_title, company, normalized_company,
      description, requirements, location, remote_type, remote_us_eligible,
      application_type, quick_apply, preferred_apply_url, lifecycle_status,
      posted_at, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'remote', 1, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertJob.run(
    "job-1",
    "Senior Project Manager",
    "senior project manager",
    "Acme",
    "acme",
    "Lead enterprise projects.",
    "PMP preferred.",
    "United States",
    "easy_apply",
    "yes",
    "https://apply.example/job-1",
    "active",
    2_000,
    1_000,
    3_000,
  );
  insertJob.run(
    "job-2",
    "Program Manager",
    "program manager",
    "Beta",
    "beta",
    "Run strategic programs.",
    null,
    "Remote - US",
    "external",
    "no",
    "https://apply.example/job-2",
    "active",
    1_500,
    900,
    2_900,
  );
  insertJob.run(
    "job-3",
    "Project Coordinator",
    "project coordinator",
    "Acme",
    "acme",
    "Coordinate delivery.",
    null,
    "United States",
    "quick_apply",
    "yes",
    "https://apply.example/job-3",
    "closed",
    1_000,
    800,
    2_000,
  );

  const insertSource = db.prepare(
    "INSERT INTO job_sources(id, job_id, source, source_url, apply_url) VALUES (?, ?, ?, ?, ?)",
  );
  insertSource.run("s1", "job-1", "builtin", "https://builtin.com/job-1", "https://apply.example/job-1");
  insertSource.run("s2", "job-2", "builtin", "https://builtin.com/job-2", "https://apply.example/job-2");
  insertSource.run("s3", "job-3", "other", "https://jobs.example/job-3", "https://apply.example/job-3");
  db.close();

  return file;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("catalog job queries", () => {
  it("lists newest jobs first and keeps source names available", () => {
    const file = createCatalog();
    const jobs = listCatalogJobs({ catalogPath: file });

    expect(jobs.map((job) => job.id)).toEqual(["job-1", "job-2", "job-3"]);
    expect(jobs[0]?.sources).toEqual(["builtin"]);
  });

  it("supports the V1 local filters", () => {
    const file = createCatalog();

    expect(
      listCatalogJobs({ catalogPath: file, filters: { text: "Acme" } }).map((j) => j.id),
    ).toEqual(["job-1", "job-3"]);
    expect(
      listCatalogJobs({
        catalogPath: file,
        filters: { acceptedPosition: "project manager" },
      }).map((j) => j.id),
    ).toEqual(["job-1"]);
    expect(
      listCatalogJobs({ catalogPath: file, filters: { source: "other" } }).map((j) => j.id),
    ).toEqual(["job-3"]);
    expect(
      listCatalogJobs({
        catalogPath: file,
        filters: { lifecycleStatus: "closed" },
      }).map((j) => j.id),
    ).toEqual(["job-3"]);
    expect(
      listCatalogJobs({ catalogPath: file, filters: { quickApply: "yes" } }).map((j) => j.id),
    ).toEqual(["job-1", "job-3"]);
  });

  it("returns normalized detail fields and all source/apply links", () => {
    const file = createCatalog();
    const job = getCatalogJob("job-1", file);

    expect(job).toMatchObject({
      id: "job-1",
      title: "Senior Project Manager",
      company: "Acme",
      description: "Lead enterprise projects.",
      requirements: "PMP preferred.",
      applicationType: "easy_apply",
      quickApply: "yes",
      preferredApplyUrl: "https://apply.example/job-1",
    });
    expect(job?.sources).toEqual([
      {
        source: "builtin",
        sourceUrl: "https://builtin.com/job-1",
        applyUrl: "https://apply.example/job-1",
      },
    ]);
  });
});
