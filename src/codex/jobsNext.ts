import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateApplicationEligibility } from "../applications/eligibility";
import { syncCatalogFromGitHubRelease } from "../sync/githubRelease";

export type CatalogRefreshStatus = "updated" | "current";

export type NextJob = {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  applicationUrl: string;
  applicationType: string;
  sources: string[];
  postedAt: number | null;
};

export type NextJobsResult = {
  catalogStatus: CatalogRefreshStatus;
  jobs: NextJob[];
};

type RefreshCatalog = (
  catalogPath: string,
) => Promise<{ status: CatalogRefreshStatus }>;

type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote_type: string;
  remote_us_eligible: number;
  application_type: string;
  quick_apply: string;
  preferred_apply_url: string | null;
  lifecycle_status: string;
  posted_at: number | null;
  first_seen_at: number;
};

type SourceRow = {
  job_id: string;
  source: string;
};

type StatusRow = {
  job_id: string;
  status: string;
};

function assertLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("jobs:next limit must be an integer between 1 and 100");
  }
}

function readUserStatuses(userPath: string): Map<string, string> {
  if (!fs.existsSync(userPath)) return new Map();

  const db = new Database(userPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    const hasStatusTable = db
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'job_status'",
      )
      .get() as { present: number } | undefined;

    if (!hasStatusTable) {
      throw new Error("user.sqlite is missing required job_status table");
    }

    const rows = db
      .prepare("SELECT job_id, status FROM job_status")
      .all() as StatusRow[];
    return new Map(rows.map((row) => [row.job_id, row.status]));
  } finally {
    db.close();
  }
}

function sourcesForJobs(
  db: Database.Database,
  jobIds: string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (jobIds.length === 0) return result;

  const placeholders = jobIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT job_id, source
       FROM job_sources
       WHERE job_id IN (${placeholders})
       ORDER BY source ASC`,
    )
    .all(...jobIds) as SourceRow[];

  for (const row of rows) {
    const sources = result.get(row.job_id) ?? [];
    if (!sources.includes(row.source)) sources.push(row.source);
    result.set(row.job_id, sources);
  }

  return result;
}

async function defaultRefreshCatalog(catalogPath: string) {
  const result = await syncCatalogFromGitHubRelease({ catalogPath });
  return { status: result.status };
}

export async function getNextJobs(
  args: {
    limit?: number;
    catalogPath?: string;
    userPath?: string;
    refreshCatalog?: RefreshCatalog;
  } = {},
): Promise<NextJobsResult> {
  const limit = args.limit ?? 10;
  assertLimit(limit);

  const catalogPath =
    args.catalogPath ?? process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
  const userPath =
    args.userPath ?? process.env.USER_DB_PATH ?? "./data/user.sqlite";
  const refreshCatalog = args.refreshCatalog ?? defaultRefreshCatalog;

  const refresh = await refreshCatalog(catalogPath);
  const statuses = readUserStatuses(userPath);

  const db = new Database(catalogPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    const rows = db
      .prepare(
        `SELECT
          id, title, company, location, remote_type, remote_us_eligible,
          application_type, quick_apply, preferred_apply_url, lifecycle_status,
          posted_at, first_seen_at
         FROM jobs
         ORDER BY COALESCE(posted_at, first_seen_at) DESC,
                  first_seen_at DESC,
                  id ASC`,
      )
      .all() as JobRow[];

    const eligible = rows
      .filter((row) =>
        evaluateApplicationEligibility({
          lifecycleStatus: row.lifecycle_status,
          remoteUsEligible: row.remote_us_eligible === 1,
          remoteType: row.remote_type,
          quickApply: row.quick_apply,
          applicationType: row.application_type,
          preferredApplyUrl: row.preferred_apply_url,
          userStatus: statuses.get(row.id) ?? null,
        }).eligible,
      )
      .slice(0, limit);

    const sources = sourcesForJobs(
      db,
      eligible.map((row) => row.id),
    );

    return {
      catalogStatus: refresh.status,
      jobs: eligible.map((row) => ({
        jobId: row.id,
        title: row.title,
        company: row.company,
        location: row.location,
        applicationUrl: row.preferred_apply_url!,
        applicationType: row.application_type,
        sources: sources.get(row.id) ?? [],
        postedAt: row.posted_at,
      })),
    };
  } finally {
    db.close();
  }
}
