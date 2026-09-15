import crypto from "node:crypto";
import Database from "better-sqlite3";
import { ensureUserLedger } from "../db/user/ledger";

export function resetNeedsReview(input: {
  userPath?: string;
  jobId: string;
  now?: () => number;
  id?: () => string;
}) {
  const userPath = input.userPath ?? process.env.USER_DB_PATH ?? "./data/user.sqlite";
  const jobId = input.jobId.trim();
  if (!jobId) throw new Error("job-id is required");
  const now = input.now ?? Date.now;
  const id = input.id ?? (() => `history_${crypto.randomUUID()}`);

  ensureUserLedger(userPath);
  const db = new Database(userPath);
  try {
    const tx = db.transaction(() => {
      const row = db.prepare("SELECT status FROM job_status WHERE job_id = ?").get(jobId) as { status: string } | undefined;
      if (!row || row.status !== "needs_review") {
        throw new Error("Only needs_review jobs can be reset for retry");
      }
      const changedAt = now();
      db.prepare("UPDATE job_status SET status = 'reviewed', reviewed_at = ?, notes = NULL, updated_at = ? WHERE job_id = ?")
        .run(changedAt, changedAt, jobId);
      db.prepare("INSERT INTO job_status_history(id, job_id, previous_status, new_status, changed_at) VALUES (?, ?, 'needs_review', 'reviewed', ?)")
        .run(id(), jobId, changedAt);
      return { jobId, status: "reviewed" as const };
    });
    return tx();
  } finally {
    db.close();
  }
}
