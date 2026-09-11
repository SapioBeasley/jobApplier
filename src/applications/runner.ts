import crypto from "node:crypto";
import Database from "better-sqlite3";
import { findApplicationAdapter } from "./adapters/registry";
import type { ApplicationContext, CandidateProfile } from "./types";

function loadCandidate(user: Database.Database): CandidateProfile {
  const row = user
    .prepare(
      `SELECT * FROM candidate_profiles
       WHERE active = 1
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;

  if (!row) throw new Error("No active candidate profile configured");

  return {
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    country: String(row.country ?? "US"),
    linkedinUrl: row.linkedin_url ? String(row.linkedin_url) : null,
    portfolioUrl: row.portfolio_url ? String(row.portfolio_url) : null,
    workAuthorizedUs:
      row.work_authorized_us == null ? null : Boolean(row.work_authorized_us),
    requiresSponsorship:
      row.requires_sponsorship == null ? null : Boolean(row.requires_sponsorship),
    yearsExperience:
      row.years_experience == null ? null : Number(row.years_experience),
    desiredSalary:
      row.desired_salary == null ? null : Number(row.desired_salary),
  };
}

function loadResume(user: Database.Database): string {
  const row = user
    .prepare(
      `SELECT file_path FROM resumes
       WHERE active = 1
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get() as { file_path?: string } | undefined;

  if (!row?.file_path) throw new Error("No active resume configured");
  return row.file_path;
}

function loadSavedAnswers(user: Database.Database): Record<string, string> {
  const rows = user.prepare(`SELECT key, answer FROM saved_answers`).all() as Array<{
    key: string;
    answer: string;
  }>;

  return Object.fromEntries(rows.map((row) => [row.key, row.answer]));
}

export async function runNextApplication(args?: {
  catalogPath?: string;
  userPath?: string;
}) {
  const catalogPath = args?.catalogPath ?? process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
  const userPath = args?.userPath ?? process.env.USER_DB_PATH ?? "./data/user.sqlite";

  const catalog = new Database(catalogPath, { readonly: true });
  const user = new Database(userPath);
  user.pragma("foreign_keys = ON");

  try {
    const queued = user
      .prepare(
        `SELECT job_id
         FROM application_queue
         WHERE state = 'queued'
         ORDER BY priority DESC, queued_at ASC
         LIMIT 1`,
      )
      .get() as { job_id?: string } | undefined;

    if (!queued?.job_id) return { status: "empty" as const };

    const job = catalog
      .prepare(
        `SELECT id, title, company, preferred_apply_url, application_type, quick_apply
         FROM jobs
         WHERE id = ? LIMIT 1`,
      )
      .get(queued.job_id) as Record<string, unknown> | undefined;

    if (!job?.preferred_apply_url) {
      user
        .prepare(
          `UPDATE application_queue
           SET state = 'needs_review', review_reason = ?, updated_at = ?
           WHERE job_id = ?`,
        )
        .run("missing_application_url", Date.now(), queued.job_id);

      return { status: "needs_review" as const, reason: "missing_application_url" };
    }

    const applicationUrl = String(job.preferred_apply_url);
    const adapter = await findApplicationAdapter(applicationUrl);

    if (!adapter) {
      user
        .prepare(
          `UPDATE application_queue
           SET state = 'needs_review', review_reason = ?, updated_at = ?
           WHERE job_id = ?`,
        )
        .run("unsupported_application_flow", Date.now(), queued.job_id);

      return {
        status: "needs_review" as const,
        reason: "unsupported_application_flow",
      };
    }

    const candidate = loadCandidate(user);
    const resumePath = loadResume(user);
    const savedAnswers = loadSavedAnswers(user);
    const attemptId = `attempt_${crypto.randomUUID()}`;
    const startedAt = Date.now();

    user
      .prepare(
        `UPDATE application_queue
         SET state = 'applying', started_at = ?, updated_at = ?
         WHERE job_id = ?`,
      )
      .run(startedAt, startedAt, queued.job_id);

    user
      .prepare(
        `INSERT INTO application_attempts(
          id, job_id, adapter, status, application_url, application_type, started_at
        ) VALUES (?, ?, ?, 'started', ?, ?, ?)`,
      )
      .run(
        attemptId,
        queued.job_id,
        adapter.name,
        applicationUrl,
        String(job.application_type ?? "unknown"),
        startedAt,
      );

    const context: ApplicationContext = {
      job: {
        id: String(job.id),
        title: String(job.title),
        company: String(job.company),
        applicationUrl,
        applicationType: String(job.application_type ?? "unknown"),
        quickApply: String(job.quick_apply ?? "unknown"),
      },
      candidate,
      resumePath,
      savedAnswers,
      allowSubmit: true,
    };

    const result = await adapter.apply(context);
    const completedAt = Date.now();

    if (result.status === "submitted") {
      const tx = user.transaction(() => {
        user
          .prepare(
            `UPDATE application_attempts
             SET status = 'submitted', completed_at = ?, submitted_at = ?
             WHERE id = ?`,
          )
          .run(completedAt, result.submittedAt.getTime(), attemptId);

        user
          .prepare(
            `UPDATE application_queue
             SET state = 'applied', completed_at = ?, updated_at = ?
             WHERE job_id = ?`,
          )
          .run(completedAt, completedAt, queued.job_id);

        user
          .prepare(
            `INSERT INTO job_status(job_id, status, applied_at, updated_at)
             VALUES (?, 'applied', ?, ?)
             ON CONFLICT(job_id) DO UPDATE SET
               status = 'applied', applied_at = excluded.applied_at,
               updated_at = excluded.updated_at`,
          )
          .run(queued.job_id, result.submittedAt.getTime(), completedAt);
      });
      tx();
      return { status: "applied" as const, jobId: queued.job_id };
    }

    if (result.status === "needs_review") {
      const tx = user.transaction(() => {
        user
          .prepare(
            `UPDATE application_attempts
             SET status = 'needs_review', completed_at = ?, failure_message = ?
             WHERE id = ?`,
          )
          .run(completedAt, result.reason, attemptId);
        user
          .prepare(
            `UPDATE application_queue
             SET state = 'needs_review', review_reason = ?, completed_at = ?, updated_at = ?
             WHERE job_id = ?`,
          )
          .run(result.reason, completedAt, completedAt, queued.job_id);
      });
      tx();
      return { status: "needs_review" as const, reason: result.reason };
    }

    const tx = user.transaction(() => {
      user
        .prepare(
          `UPDATE application_attempts
           SET status = 'failed', completed_at = ?, failure_code = ?, failure_message = ?
           WHERE id = ?`,
        )
        .run(completedAt, result.code, result.message, attemptId);
      user
        .prepare(
          `UPDATE application_queue
           SET state = 'failed', failure_code = ?, failure_message = ?, completed_at = ?, updated_at = ?
           WHERE job_id = ?`,
        )
        .run(result.code, result.message, completedAt, completedAt, queued.job_id);
    });
    tx();

    return { status: "failed" as const, code: result.code };
  } finally {
    catalog.close();
    user.close();
  }
}
