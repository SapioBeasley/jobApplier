import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { recordApplicationResult } from "../src/codex/applicationResult";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-result-"));
  tempDirs.push(dir);
  return dir;
}

function createCatalog(file: string, jobIds: string[]) {
  const db = new Database(file);
  db.exec("CREATE TABLE jobs (id TEXT PRIMARY KEY)");
  const insert = db.prepare("INSERT INTO jobs(id) VALUES (?)");
  for (const jobId of jobIds) insert.run(jobId);
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
  `);
  db.close();
}

function setup(jobIds = ["job-1"]) {
  const dir = tempDir();
  const catalogPath = path.join(dir, "catalog.sqlite");
  const userPath = path.join(dir, "user.sqlite");
  createCatalog(catalogPath, jobIds);
  createUserDb(userPath);
  return { catalogPath, userPath };
}

function openUser(userPath: string) {
  return new Database(userPath, { readonly: true, fileMustExist: true });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("recordApplicationResult", () => {
  it("records applied status and immutable history without touching unrelated jobs", () => {
    const { catalogPath, userPath } = setup(["job-1", "job-2"]);
    const seed = new Database(userPath);
    seed
      .prepare("INSERT INTO job_status(job_id, status, skipped_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("job-2", "skipped", 500, 500);
    seed.close();

    const result = recordApplicationResult({
      catalogPath,
      userPath,
      jobId: "job-1",
      status: "applied",
      now: () => 1000,
      id: () => "history-1",
    });

    expect(result).toEqual({ jobId: "job-1", status: "applied", changed: true });

    const db = openUser(userPath);
    expect(
      db.prepare(
        "SELECT job_id, status, applied_at, skipped_at, notes, updated_at FROM job_status ORDER BY job_id",
      ).all(),
    ).toEqual([
      {
        job_id: "job-1",
        status: "applied",
        applied_at: 1000,
        skipped_at: null,
        notes: null,
        updated_at: 1000,
      },
      {
        job_id: "job-2",
        status: "skipped",
        applied_at: null,
        skipped_at: 500,
        notes: null,
        updated_at: 500,
      },
    ]);
    expect(db.prepare("SELECT * FROM job_status_history").all()).toEqual([
      {
        id: "history-1",
        job_id: "job-1",
        previous_status: null,
        new_status: "applied",
        changed_at: 1000,
      },
    ]);
    db.close();
  });

  it.each(["needs_review", "failed"] as const)(
    "requires a non-empty reason for %s without mutating state",
    (status) => {
      const { catalogPath, userPath } = setup();

      expect(() =>
        recordApplicationResult({
          catalogPath,
          userPath,
          jobId: "job-1",
          status,
          reason: "   ",
        }),
      ).toThrow("reason");

      const db = openUser(userPath);
      expect(db.prepare("SELECT COUNT(*) AS count FROM job_status").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM job_status_history").get()).toEqual({ count: 0 });
      db.close();
    },
  );

  it("preserves prior history when recording a later valid state change", () => {
    const { catalogPath, userPath } = setup();
    const seed = new Database(userPath);
    seed
      .prepare("INSERT INTO job_status(job_id, status, updated_at) VALUES (?, 'new', ?)")
      .run("job-1", 100);
    seed
      .prepare(
        "INSERT INTO job_status_history(id, job_id, previous_status, new_status, changed_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("history-old", "job-1", null, "new", 100);
    seed.close();

    recordApplicationResult({
      catalogPath,
      userPath,
      jobId: "job-1",
      status: "failed",
      reason: "form changed",
      now: () => 200,
      id: () => "history-new",
    });

    const db = openUser(userPath);
    expect(
      db.prepare(
        "SELECT id, previous_status, new_status, changed_at FROM job_status_history WHERE job_id = ? ORDER BY changed_at",
      ).all("job-1"),
    ).toEqual([
      { id: "history-old", previous_status: null, new_status: "new", changed_at: 100 },
      { id: "history-new", previous_status: "new", new_status: "failed", changed_at: 200 },
    ]);
    expect(db.prepare("SELECT status, notes FROM job_status WHERE job_id = ?").get("job-1")).toEqual({
      status: "failed",
      notes: "form changed",
    });
    db.close();
  });

  it("treats repeated recording of the same durable status as idempotent", () => {
    const { catalogPath, userPath } = setup();
    const seed = new Database(userPath);
    seed
      .prepare("INSERT INTO job_status(job_id, status, applied_at, updated_at) VALUES (?, 'applied', ?, ?)")
      .run("job-1", 100, 100);
    seed.close();

    const result = recordApplicationResult({
      catalogPath,
      userPath,
      jobId: "job-1",
      status: "applied",
      now: () => 200,
      id: () => "should-not-be-used",
    });

    expect(result).toEqual({ jobId: "job-1", status: "applied", changed: false });
    const db = openUser(userPath);
    expect(db.prepare("SELECT applied_at, updated_at FROM job_status WHERE job_id = ?").get("job-1")).toEqual({
      applied_at: 100,
      updated_at: 100,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM job_status_history").get()).toEqual({ count: 0 });
    db.close();
  });

  it("refuses to change an applied job to another status", () => {
    const { catalogPath, userPath } = setup();
    const seed = new Database(userPath);
    seed
      .prepare("INSERT INTO job_status(job_id, status, applied_at, updated_at) VALUES (?, 'applied', ?, ?)")
      .run("job-1", 100, 100);
    seed.close();

    expect(() =>
      recordApplicationResult({
        catalogPath,
        userPath,
        jobId: "job-1",
        status: "failed",
        reason: "should not overwrite applied",
      }),
    ).toThrow("terminal");

    const db = openUser(userPath);
    expect(db.prepare("SELECT status FROM job_status WHERE job_id = ?").get("job-1")).toEqual({
      status: "applied",
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM job_status_history").get()).toEqual({ count: 0 });
    db.close();
  });

  it("fails closed for an unknown canonical job without mutating user.sqlite", () => {
    const { catalogPath, userPath } = setup(["known"]);

    expect(() =>
      recordApplicationResult({
        catalogPath,
        userPath,
        jobId: "unknown",
        status: "skipped",
      }),
    ).toThrow("not found");

    const db = openUser(userPath);
    expect(db.prepare("SELECT COUNT(*) AS count FROM job_status").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM job_status_history").get()).toEqual({ count: 0 });
    db.close();
  });

  it("rejects unsupported outcomes before mutation", () => {
    const { catalogPath, userPath } = setup();

    expect(() =>
      recordApplicationResult({
        catalogPath,
        userPath,
        jobId: "job-1",
        status: "submitted" as never,
      }),
    ).toThrow("Unsupported application result status");

    const db = openUser(userPath);
    expect(db.prepare("SELECT COUNT(*) AS count FROM job_status").get()).toEqual({ count: 0 });
    db.close();
  });
});
