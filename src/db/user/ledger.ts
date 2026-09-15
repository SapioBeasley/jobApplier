import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function ensureUserLedger(userPath: string): void {
  fs.mkdirSync(path.dirname(userPath), { recursive: true });

  const db = new Database(userPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_status (
        job_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'new',
        saved_at INTEGER,
        reviewed_at INTEGER,
        applied_at INTEGER,
        skipped_at INTEGER,
        notes TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS job_status_status_idx
        ON job_status(status);

      CREATE TABLE IF NOT EXISTS job_status_history (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        previous_status TEXT,
        new_status TEXT NOT NULL,
        changed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS job_status_history_job_idx
        ON job_status_history(job_id);
    `);
  } finally {
    db.close();
  }
}
