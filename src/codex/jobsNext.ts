import Database from "better-sqlite3";
import { evaluateApplicationEligibility } from "../applications/eligibility";
import { ensureUserLedger } from "../db/user/ledger";
import { hasContradictoryNonUsRegion, locationPriority } from "../jobs/usPriority";
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

export type NextJobsDiagnostics = {
  totalEvaluated: number;
  totalEligible: number;
  totalReturned: number;
  ineligibleReasonCounts: Record<string, number>;
};

export type NextJobsResult = {
  catalogStatus: CatalogRefreshStatus;
  diagnostics: NextJobsDiagnostics;
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

type SourceRow = { job_id: string; source: string };
type StatusRow = { job_id: string; status: string };

const BLOCKED_AUTOMATIC_STATUSES = new Set([
  "applied",
  "skipped",
  "needs_review",
  "failed",
]);

function assertLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("jobs:next limit must be an integer between 1 and 100");
  }
}

function readUserStatuses(userPath: string): Map<string, string> {
  const db = new Database(userPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    const rows = db.prepare("SELECT job_id, status FROM job_status").all() as StatusRow[];
    return new Map(rows.map((row) => [row.job_id, row.status]));
  } finally {
    db.close();
  }
}

function sourcesForJobs(db: Database.Database, jobIds: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (jobIds.length === 0) return result;
  const placeholders = jobIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT job_id, source FROM job_sources WHERE job_id IN (${placeholders}) ORDER BY source ASC`).all(...jobIds) as SourceRow[];
  for (const row of rows) {
    const sources = result.get(row.job_id) ?? [];
    if (!sources.includes(row.source)) sources.push(row.source);
    result.set(row.job_id, sources);
  }
  return result;
}

function reasonsForRow(row: JobRow, userStatus: string | null): string[] {
  if (userStatus && BLOCKED_AUTOMATIC_STATUSES.has(userStatus)) {
    return [`durable_${userStatus}`];
  }
  if (hasContradictoryNonUsRegion(row.title, row.location)) {
    return ["contradictory_non_us_region"];
  }
  return evaluateApplicationEligibility({
    lifecycleStatus: row.lifecycle_status,
    remoteUsEligible: row.remote_us_eligible === 1,
    remoteType: row.remote_type,
    quickApply: row.quick_apply,
    applicationType: row.application_type,
    preferredApplyUrl: row.preferred_apply_url,
    userStatus,
  }).reasons;
}

function compareEligibleJobs(a: JobRow, b: JobRow): number {
  const locationDifference = locationPriority(a.location) - locationPriority(b.location);
  if (locationDifference !== 0) return locationDifference;
  const aPosted = a.posted_at ?? a.first_seen_at;
  const bPosted = b.posted_at ?? b.first_seen_at;
  if (aPosted !== bPosted) return bPosted - aPosted;
  if (a.first_seen_at !== b.first_seen_at) return b.first_seen_at - a.first_seen_at;
  return a.id.localeCompare(b.id);
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
  const catalogPath = args.catalogPath ?? process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
  const userPath = args.userPath ?? process.env.USER_DB_PATH ?? "./data/user.sqlite";
  const refreshCatalog = args.refreshCatalog ?? defaultRefreshCatalog;

  const refresh = await refreshCatalog(catalogPath);
  ensureUserLedger(userPath);
  const statuses = readUserStatuses(userPath);
  const db = new Database(catalogPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    const rows = db.prepare(`SELECT id, title, company, location, remote_type, remote_us_eligible, application_type, quick_apply, preferred_apply_url, lifecycle_status, posted_at, first_seen_at FROM jobs`).all() as JobRow[];
    const ineligibleReasonCounts: Record<string, number> = {};
    const eligibleRows: JobRow[] = [];
    for (const row of rows) {
      const reasons = reasonsForRow(row, statuses.get(row.id) ?? null);
      if (reasons.length === 0) {
        eligibleRows.push(row);
      } else {
        for (const reason of reasons) {
          ineligibleReasonCounts[reason] = (ineligibleReasonCounts[reason] ?? 0) + 1;
        }
      }
    }
    eligibleRows.sort(compareEligibleJobs);
    const eligible = eligibleRows.slice(0, limit);
    const sources = sourcesForJobs(db, eligible.map((row) => row.id));
    return {
      catalogStatus: refresh.status,
      diagnostics: {
        totalEvaluated: rows.length,
        totalEligible: eligibleRows.length,
        totalReturned: eligible.length,
        ineligibleReasonCounts,
      },
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
