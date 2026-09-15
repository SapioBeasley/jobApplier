import crypto from "node:crypto";
import Database from "better-sqlite3";

export const APPLICATION_RESULT_STATUSES = [
  "applied",
  "needs_review",
  "failed",
  "skipped",
] as const;

export type ApplicationResultStatus = (typeof APPLICATION_RESULT_STATUSES)[number];

export type RecordApplicationResultInput = {
  jobId: string;
  status: ApplicationResultStatus;
  reason?: string;
  catalogPath?: string;
  userPath?: string;
  now?: () => number;
  id?: () => string;
};

export type RecordApplicationResultOutput = {
  jobId: string;
  status: ApplicationResultStatus;
  changed: boolean;
};

type ExistingStatus = {
  status: string;
};

const SUPPORTED_STATUSES = new Set<string>(APPLICATION_RESULT_STATUSES);
const PRE_APPLICATION_STATUSES = new Set<string>([
  "new",
  "saved",
  "reviewed",
]);
const RESET_REQUIRED_STATUSES = new Set<string>([
  "needs_review",
  "failed",
  "skipped",
]);

function requireJobId(jobId: string) {
  const value = jobId.trim();
  if (!value) throw new Error("job-id is required");
  return value;
}

function requireStatus(status: string): ApplicationResultStatus {
  if (!SUPPORTED_STATUSES.has(status)) {
    throw new Error(`Unsupported application result status: ${status}`);
  }
  return status as ApplicationResultStatus;
}

function normalizeReason(status: ApplicationResultStatus, reason?: string) {
  const normalized = reason?.trim() || null;
  if ((status === "needs_review" || status === "failed") && !normalized) {
    throw new Error(`A non-empty reason is required for ${status}`);
  }
  return normalized;
}

function assertCanonicalJobExists(catalogPath: string, jobId: string) {
  const catalog = new Database(catalogPath, {
    readonly: true,
    fileMustExist: true,
  });
  catalog.pragma("query_only = ON");
  try {
    const row = catalog
      .prepare("SELECT 1 AS present FROM jobs WHERE id = ? LIMIT 1")
      .get(jobId) as { present: number } | undefined;
    if (!row) throw new Error(`Canonical job not found: ${jobId}`);
  } finally {
    catalog.close();
  }
}

function assertTransitionAllowed(
  previousStatus: string | null,
  nextStatus: ApplicationResultStatus,
) {
  if (!previousStatus || PRE_APPLICATION_STATUSES.has(previousStatus)) return;
  if (previousStatus === nextStatus) return;
  if (previousStatus === "applied") {
    throw new Error("applied is terminal and cannot transition to another status");
  }
  if (RESET_REQUIRED_STATUSES.has(previousStatus)) {
    throw new Error(
      `${previousStatus} requires an explicit reset before recording another application result`,
    );
  }
  throw new Error(
    `Unsupported application status transition: ${previousStatus} -> ${nextStatus}`,
  );
}

export function recordApplicationResult(
  input: RecordApplicationResultInput,
): RecordApplicationResultOutput {
  const jobId = requireJobId(input.jobId);
  const status = requireStatus(input.status);
  const reason = normalizeReason(status, input.reason);
  const catalogPath =
    input.catalogPath ?? process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
  const userPath = input.userPath ?? process.env.USER_DB_PATH ?? "./data/user.sqlite";
  const now = input.now ?? Date.now;
  const id = input.id ?? (() => `history_${crypto.randomUUID()}`);

  assertCanonicalJobExists(catalogPath, jobId);

  const user = new Database(userPath, { fileMustExist: true });
  user.pragma("foreign_keys = ON");

  try {
    const tx = user.transaction(() => {
      const existing = user
        .prepare("SELECT status FROM job_status WHERE job_id = ? LIMIT 1")
        .get(jobId) as ExistingStatus | undefined;
      const previousStatus = existing?.status ?? null;

      assertTransitionAllowed(previousStatus, status);

      if (previousStatus === status) {
        return {
          jobId,
          status,
          changed: false,
        } satisfies RecordApplicationResultOutput;
      }

      const changedAt = now();
      const appliedAt = status === "applied" ? changedAt : null;
      const skippedAt = status === "skipped" ? changedAt : null;

      if (existing) {
        user
          .prepare(
            `UPDATE job_status
             SET status = ?,
                 applied_at = CASE WHEN ? IS NOT NULL THEN ? ELSE applied_at END,
                 skipped_at = CASE WHEN ? IS NOT NULL THEN ? ELSE skipped_at END,
                 notes = ?,
                 updated_at = ?
             WHERE job_id = ?`,
          )
          .run(
            status,
            appliedAt,
            appliedAt,
            skippedAt,
            skippedAt,
            reason,
            changedAt,
            jobId,
          );
      } else {
        user
          .prepare(
            `INSERT INTO job_status(
               job_id, status, applied_at, skipped_at, notes, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(jobId, status, appliedAt, skippedAt, reason, changedAt);
      }

      user
        .prepare(
          `INSERT INTO job_status_history(
             id, job_id, previous_status, new_status, changed_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id(), jobId, previousStatus, status, changedAt);

      return {
        jobId,
        status,
        changed: true,
      } satisfies RecordApplicationResultOutput;
    });

    return tx();
  } finally {
    user.close();
  }
}
