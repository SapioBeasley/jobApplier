import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { recordApplicationResult } from "../src/codex/applicationResult";
import { getNextJobs } from "../src/codex/jobsNext";
import { syncCatalog, type CatalogManifest } from "../src/sync/catalog";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-pipeline-"));
  tempDirs.push(dir);
  return dir;
}

type JobFixture = {
  id: string;
  postedAt: number;
  remoteType?: string;
  remoteUsEligible?: boolean;
  applicationType?: string;
  quickApply?: string;
  preferredApplyUrl?: string | null;
  lifecycleStatus?: string;
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
      `Title ${job.id}`,
      "Example Co",
      "Remote",
      job.remoteType ?? "remote",
      job.remoteUsEligible === false ? 0 : 1,
      job.applicationType ?? "easy_apply",
      job.quickApply ?? "yes",
      applyUrl,
      job.lifecycleStatus ?? "active",
      job.postedAt,
      100 + index,
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

function createUserDb(file: string) {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE job_status (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'new',
      saved_at INTEGER,
      reviewed_at INTEGER,
      applied_at INTEGER,
      skipped_at INTEGER,
      notes TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE job_status_history (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_at INTEGER NOT NULL
    );
    CREATE TABLE candidate_profile (
      id TEXT PRIMARY KEY,
      private_value TEXT NOT NULL
    );
  `);
  db.prepare(
    "INSERT INTO candidate_profile(id, private_value) VALUES ('candidate', 'PRIVATE-CANDIDATE-MARKER')",
  ).run();
  db.prepare(
    "INSERT INTO job_status(job_id, status, skipped_at, notes, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("unrelated-history", "skipped", 50, "keep me", 50);
  db.prepare(
    "INSERT INTO job_status_history(id, job_id, previous_status, new_status, changed_at) VALUES (?, ?, ?, ?, ?)",
  ).run("history-unrelated", "unrelated-history", null, "skipped", 50);
  db.close();
}

function releaseFixture(catalogPath: string, generatedAt: string) {
  const database = fs.readFileSync(catalogPath);
  const manifest: CatalogManifest = {
    schemaVersion: 1,
    generatedAt,
    runId: "fixture-run",
    jobCount: 0,
    activeJobCount: 0,
    sourceCount: 1,
    sha256: crypto.createHash("sha256").update(database).digest("hex"),
    database: "catalog.sqlite.gz",
  };

  return {
    manifest: Buffer.from(JSON.stringify(manifest), "utf8"),
    database: gzipSync(database),
  };
}

function fixtureRefresh(
  targetPath: string,
  release: ReturnType<typeof releaseFixture>,
) {
  return syncCatalog({
    manifestUrl: "fixture://manifest.json",
    databaseUrl: "fixture://catalog.sqlite.gz",
    catalogPath: targetPath,
    download: async (url) => {
      if (url.endsWith("manifest.json")) return release.manifest;
      if (url.endsWith("catalog.sqlite.gz")) return release.database;
      throw new Error(`Unexpected fixture URL: ${url}`);
    },
  });
}

function snapshotUserState(userPath: string) {
  const db = new Database(userPath, { readonly: true, fileMustExist: true });
  try {
    return {
      statuses: db
        .prepare("SELECT * FROM job_status ORDER BY job_id")
        .all(),
      history: db
        .prepare("SELECT * FROM job_status_history ORDER BY changed_at, id")
        .all(),
      profile: db.prepare("SELECT * FROM candidate_profile").all(),
    };
  } finally {
    db.close();
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("catalog -> Codex -> durable state pipeline", () => {
  it("refreshes a newer catalog, hands off only eligible jobs, records applied, and never hands that job off again", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const publishedPath = path.join(dir, "published.sqlite");
    const userPath = path.join(dir, "user.sqlite");

    createCatalog(catalogPath, "2026-09-14T00:00:00.000Z", [
      { id: "stale", postedAt: 1, quickApply: "no" },
    ]);
    createCatalog(publishedPath, "2026-09-15T00:00:00.000Z", [
      { id: "eligible-newest", postedAt: 500, source: "builtin" },
      { id: "eligible-older", postedAt: 400, source: "globalwork" },
      { id: "onsite", postedAt: 390, remoteType: "onsite" },
      { id: "not-us", postedAt: 380, remoteUsEligible: false },
      { id: "unknown-quick", postedAt: 370, quickApply: "unknown" },
      { id: "external", postedAt: 360, applicationType: "external" },
      { id: "missing-url", postedAt: 350, preferredApplyUrl: null },
      { id: "closed", postedAt: 340, lifecycleStatus: "closed" },
    ]);
    createUserDb(userPath);

    const release = releaseFixture(
      publishedPath,
      "2026-09-15T00:00:00.000Z",
    );
    const userBeforeRefresh = snapshotUserState(userPath);

    const first = await getNextJobs({
      catalogPath,
      userPath,
      limit: 10,
      refreshCatalog: (targetPath) => fixtureRefresh(targetPath, release),
    });

    expect(first.catalogStatus).toBe("updated");
    expect(first.jobs.map((job) => job.jobId)).toEqual([
      "eligible-newest",
      "eligible-older",
    ]);
    expect(snapshotUserState(userPath)).toEqual(userBeforeRefresh);
    expect(JSON.stringify(first)).not.toContain("PRIVATE-CANDIDATE-MARKER");
    expect(JSON.stringify(first)).not.toContain("keep me");

    const catalog = new Database(catalogPath, {
      readonly: true,
      fileMustExist: true,
    });
    expect(
      catalog
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: "catalog_metadata" },
      { name: "job_sources" },
      { name: "jobs" },
    ]);
    catalog.close();

    recordApplicationResult({
      catalogPath,
      userPath,
      jobId: "eligible-newest",
      status: "applied",
      now: () => 1_000,
      id: () => "history-applied",
    });

    const second = await getNextJobs({
      catalogPath,
      userPath,
      limit: 10,
      refreshCatalog: (targetPath) => fixtureRefresh(targetPath, release),
    });

    expect(second.catalogStatus).toBe("current");
    expect(second.jobs.map((job) => job.jobId)).toEqual(["eligible-older"]);

    const user = new Database(userPath, {
      readonly: true,
      fileMustExist: true,
    });
    expect(
      user
        .prepare(
          "SELECT job_id, status, notes FROM job_status ORDER BY job_id",
        )
        .all(),
    ).toEqual([
      { job_id: "eligible-newest", status: "applied", notes: null },
      { job_id: "unrelated-history", status: "skipped", notes: "keep me" },
    ]);
    expect(
      user
        .prepare(
          "SELECT id, job_id, previous_status, new_status FROM job_status_history ORDER BY changed_at, id",
        )
        .all(),
    ).toEqual([
      {
        id: "history-unrelated",
        job_id: "unrelated-history",
        previous_status: null,
        new_status: "skipped",
      },
      {
        id: "history-applied",
        job_id: "eligible-newest",
        previous_status: null,
        new_status: "applied",
      },
    ]);
    user.close();
  });

  it.each([
    ["needs_review", "required answer is unknown"],
    ["failed", "application site returned an error"],
    ["skipped", undefined],
  ] as const)(
    "keeps %s durable and allows unrelated eligible jobs to continue",
    async (status, reason) => {
      const dir = tempDir();
      const catalogPath = path.join(dir, "catalog.sqlite");
      const userPath = path.join(dir, "user.sqlite");
      createCatalog(catalogPath, "2026-09-15T00:00:00.000Z", [
        { id: "first", postedAt: 200 },
        { id: "second", postedAt: 100 },
      ]);
      createUserDb(userPath);

      recordApplicationResult({
        catalogPath,
        userPath,
        jobId: "first",
        status,
        reason,
        now: () => 1_000,
        id: () => `history-${status}`,
      });

      const next = await getNextJobs({
        catalogPath,
        userPath,
        limit: 10,
        refreshCatalog: async () => ({ status: "current" as const }),
      });

      expect(next.jobs.map((job) => job.jobId)).toEqual(["second"]);

      const user = new Database(userPath, {
        readonly: true,
        fileMustExist: true,
      });
      expect(
        user
          .prepare("SELECT status, notes FROM job_status WHERE job_id = ?")
          .get("first"),
      ).toEqual({ status, notes: reason ?? null });
      expect(
        user
          .prepare("SELECT status, notes FROM job_status WHERE job_id = ?")
          .get("unrelated-history"),
      ).toEqual({ status: "skipped", notes: "keep me" });
      user.close();
    },
  );

  it("fails closed on refresh failure while preserving the installed catalog and all private state", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const userPath = path.join(dir, "user.sqlite");
    createCatalog(catalogPath, "2026-09-14T00:00:00.000Z", [
      { id: "installed", postedAt: 100 },
    ]);
    createUserDb(userPath);

    const catalogBefore = fs.readFileSync(catalogPath);
    const userBefore = fs.readFileSync(userPath);

    await expect(
      getNextJobs({
        catalogPath,
        userPath,
        limit: 10,
        refreshCatalog: async () => {
          throw new Error("fixture release unavailable");
        },
      }),
    ).rejects.toThrow("fixture release unavailable");

    expect(fs.readFileSync(catalogPath)).toEqual(catalogBefore);
    expect(fs.readFileSync(userPath)).toEqual(userBefore);
  });
});
