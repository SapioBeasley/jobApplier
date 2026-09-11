import crypto from "node:crypto";
import Database from "better-sqlite3";
import { evaluateApplicationEligibility } from "./eligibility";

function open(path: string, readonly = false) {
  return new Database(path, { readonly });
}

export function syncApplicationQueue(args?: {
  catalogPath?: string;
  userPath?: string;
}) {
  const catalogPath = args?.catalogPath ?? process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
  const userPath = args?.userPath ?? process.env.USER_DB_PATH ?? "./data/user.sqlite";

  const catalog = open(catalogPath, true);
  const user = open(userPath);
  const now = Date.now();

  try {
    user.pragma("foreign_keys = ON");

    const jobs = catalog
      .prepare(
        `SELECT
           id, lifecycle_status, remote_us_eligible, remote_type,
           quick_apply, application_type, preferred_apply_url,
           posted_at, first_seen_at
         FROM jobs
         WHERE lifecycle_status = 'active'`,
      )
      .all() as Array<Record<string, unknown>>;

    const getStatus = user.prepare(
      `SELECT status FROM job_status WHERE job_id = ? LIMIT 1`,
    );

    const alreadyQueued = user.prepare(
      `SELECT 1 FROM application_queue WHERE job_id = ? LIMIT 1`,
    );

    const insertQueue = user.prepare(
      `INSERT INTO application_queue(
        job_id, state, priority, queued_at, updated_at
      ) VALUES (?, 'queued', ?, ?, ?)`,
    );

    let queued = 0;
    let rejected = 0;

    const tx = user.transaction(() => {
      for (const job of jobs) {
        const jobId = String(job.id);
        if (alreadyQueued.get(jobId)) continue;

        const statusRow = getStatus.get(jobId) as { status?: string } | undefined;
        const eligibility = evaluateApplicationEligibility({
          lifecycleStatus: String(job.lifecycle_status),
          remoteUsEligible: Boolean(job.remote_us_eligible),
          remoteType: String(job.remote_type),
          quickApply: String(job.quick_apply),
          applicationType: String(job.application_type),
          preferredApplyUrl: job.preferred_apply_url
            ? String(job.preferred_apply_url)
            : null,
          userStatus: statusRow?.status ?? null,
        });

        if (!eligibility.eligible) {
          rejected += 1;
          continue;
        }

        const sortTime = Number(job.posted_at ?? job.first_seen_at ?? now);
        insertQueue.run(jobId, sortTime, now, now);
        queued += 1;
      }
    });

    tx();
    return { queued, rejected, scanId: crypto.randomUUID() };
  } finally {
    catalog.close();
    user.close();
  }
}
