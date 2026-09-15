import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getNextJobs } from "../src/codex/jobsNext";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-next-"));
  tempDirs.push(dir);
  return dir;
}

type JobFixture = {
  id: string;
  title?: string;
  company?: string;
  location?: string | null;
  remoteType?: string;
  remoteUsEligible?: boolean;
  applicationType?: string;
  quickApply?: string;
  preferredApplyUrl?: string | null;
  lifecycleStatus?: string;
  postedAt?: number | null;
  firstSeenAt?: number;
  source?: string;
};

function createCatalog(file: string, generatedAt: string, jobs: JobFixture[]) {
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
  db.prepare(
    "INSERT INTO catalog_metadata(key, value) VALUES ('generated_at', ?)",
  ).run(generatedAt);

  const insertJob = db.prepare(`
    INSERT INTO jobs(
      id, title, company, location, remote_type, remote_us_eligible,
      application_type, quick_apply, preferred_apply_url, lifecycle_status,
      posted_at, first_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSource = db.prepare(`
    INSERT INTO job_sources(id, job_id, source, source_url, apply_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const [index, job] of jobs.entries()) {
    const applyUrl =
      job.preferredApplyUrl === undefined
        ? `https://apply.example/${job.id}`
        : job.preferredApplyUrl;
    insertJob.run(
      job.id,
      job.title ?? `Title ${job.id}`,
      job.company ?? "Example Co",
      job.location ?? "Remote",
      job.remoteType ?? "remote",
      job.remoteUsEligible === false ? 0 : 1,
      job.applicationType ?? "easy_apply",
      job.quickApply ?? "yes",
      applyUrl,
      job.lifecycleStatus ?? "active",
      job.postedAt ?? 1_000 - index,
      job.firstSeenAt ?? 100 + index,
    );
    insertSource.run(
      `source-${job.id}`,
      job.id,
      job.source ?? "fixture",
      `https://source.example/${job.id}`,
      applyUrl,
    );
  }

  db.close();
}

function createUserDb(file: string, statuses: Array<[string, string]>) {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE job_status (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const insert = db.prepare(
    "INSERT INTO job_status(job_id, status, updated_at) VALUES (?, ?, ?)",
  );
  for (const [jobId, status] of statuses) insert.run(jobId, status, 1);
  db.close();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("getNextJobs", () => {
  it("refreshes the catalog before selecting jobs", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const publishedPath = path.join(dir, "published.sqlite");
    const userPath = path.join(dir, "user.sqlite");

    createCatalog(catalogPath, "2026-09-14T00:00:00.000Z", [
      { id: "stale", quickApply: "no" },
    ]);
    createCatalog(publishedPath, "2026-09-15T00:00:00.000Z", [
      { id: "fresh", postedAt: 2000 },
    ]);
    createUserDb(userPath, []);

    const result = await getNextJobs({
      catalogPath,
      userPath,
      limit: 10,
      refreshCatalog: async (targetPath) => {
        fs.copyFileSync(publishedPath, targetPath);
        return { status: "updated" as const };
      },
    });

    expect(result.catalogStatus).toBe("updated");
    expect(result.jobs.map((job) => job.jobId)).toEqual(["fresh"]);
  });

  it("returns only confirmed eligible jobs in deterministic order and respects limit", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const userPath = path.join(dir, "user.sqlite");

    createCatalog(catalogPath, "2026-09-15T00:00:00.000Z", [
      { id: "applied", postedAt: 3000 },
      { id: "skipped", postedAt: 2900 },
      { id: "newest", postedAt: 2800, source: "builtin" },
      { id: "older", postedAt: 2700, source: "globalwork" },
      { id: "onsite", postedAt: 2600, remoteType: "onsite" },
      { id: "not-us", postedAt: 2500, remoteUsEligible: false },
      { id: "unknown-quick", postedAt: 2400, quickApply: "unknown" },
      { id: "external", postedAt: 2300, applicationType: "external" },
      { id: "missing-url", postedAt: 2200, preferredApplyUrl: null },
      { id: "closed", postedAt: 2100, lifecycleStatus: "closed" },
    ]);
    createUserDb(userPath, [
      ["applied", "applied"],
      ["skipped", "skipped"],
    ]);

    const all = await getNextJobs({
      catalogPath,
      userPath,
      limit: 10,
      refreshCatalog: async () => ({ status: "current" as const }),
    });

    expect(all.catalogStatus).toBe("current");
    expect(all.jobs).toEqual([
      {
        jobId: "newest",
        title: "Title newest",
        company: "Example Co",
        location: "Remote",
        applicationUrl: "https://apply.example/newest",
        applicationType: "easy_apply",
        sources: ["builtin"],
        postedAt: 2800,
      },
      {
        jobId: "older",
        title: "Title older",
        company: "Example Co",
        location: "Remote",
        applicationUrl: "https://apply.example/older",
        applicationType: "easy_apply",
        sources: ["globalwork"],
        postedAt: 2700,
      },
    ]);

    const limited = await getNextJobs({
      catalogPath,
      userPath,
      limit: 1,
      refreshCatalog: async () => ({ status: "current" as const }),
    });
    expect(limited.jobs.map((job) => job.jobId)).toEqual(["newest"]);
  });

  it("fails closed when catalog refresh fails", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const userPath = path.join(dir, "user.sqlite");
    createCatalog(catalogPath, "2026-09-14T00:00:00.000Z", [
      { id: "stale-but-eligible" },
    ]);
    createUserDb(userPath, []);

    await expect(
      getNextJobs({
        catalogPath,
        userPath,
        limit: 10,
        refreshCatalog: async () => {
          throw new Error("release unavailable");
        },
      }),
    ).rejects.toThrow("release unavailable");
  });
});
