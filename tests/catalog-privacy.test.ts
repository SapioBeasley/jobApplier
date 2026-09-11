import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { validateCatalog } from "../src/aggregation/validate";

describe("catalog privacy boundary", () => {
  it("rejects a catalog that contains private candidate or application tables", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-private-catalog-"));
    const file = path.join(dir, "catalog.sqlite");
    const db = new Database(file);
    const timestamp = Date.parse("2026-09-10T12:00:00.000Z");

    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        lifecycle_status TEXT NOT NULL,
        remote_type TEXT NOT NULL,
        remote_us_eligible INTEGER NOT NULL
      );
      CREATE TABLE job_sources (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        source TEXT NOT NULL
      );
      CREATE TABLE source_runs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE catalog_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Any of these user-state tables in catalog.sqlite is a privacy boundary violation.
      CREATE TABLE candidate_profile (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL
      );
    `);

    db.prepare(
      "INSERT INTO jobs(id, lifecycle_status, remote_type, remote_us_eligible) VALUES (?, 'active', 'remote', 1)",
    ).run("job_public");
    db.prepare(
      "INSERT INTO job_sources(id, job_id, source) VALUES (?, ?, ?)",
    ).run("source_public", "job_public", "fixture");
    db.prepare(
      "INSERT INTO source_runs(id, run_id, source, status) VALUES (?, ?, ?, 'success')",
    ).run("run_source", "run-private-check", "fixture");
    db.prepare(
      "INSERT INTO catalog_metadata(key, value) VALUES ('last_run_id', ?), ('generated_at', ?)",
    ).run("run-private-check", new Date(timestamp).toISOString());
    db.close();

    try {
      expect(() => validateCatalog(file)).toThrow(
        "Catalog contains private user-state tables",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
