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

      CREATE TABLE IF NOT EXISTS candidate_profiles (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        city TEXT,
        state TEXT,
        country TEXT NOT NULL DEFAULT 'US',
        linkedin_url TEXT,
        portfolio_url TEXT,
        work_authorized_us INTEGER,
        requires_sponsorship INTEGER,
        years_experience INTEGER,
        desired_salary INTEGER,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_answers (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        question_pattern TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS saved_answers_key_uq
        ON saved_answers(key);
    `);
  } finally {
    db.close();
  }
}
