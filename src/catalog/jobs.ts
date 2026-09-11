import Database from "better-sqlite3";
import { matchesAnyAcceptedPosition } from "../jobs/acceptedPosition";

export type CatalogJobListItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  applicationType: string;
  quickApply: string;
  lifecycleStatus: string;
  preferredApplyUrl: string | null;
  postedAt: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
  sources: string[];
};

export type CatalogJobSource = {
  source: string;
  sourceUrl: string;
  applyUrl: string | null;
};

export type CatalogJobDetail = CatalogJobListItem & {
  normalizedTitle: string;
  normalizedCompany: string;
  description: string | null;
  requirements: string | null;
  remoteType: string;
  remoteUsEligible: boolean;
  sources: CatalogJobSource[];
};

export type CatalogJobFilters = {
  text?: string;
  acceptedPosition?: string;
  source?: string;
  lifecycleStatus?: string;
  quickApply?: string;
};

type JobRow = {
  id: string;
  title: string;
  normalized_title: string;
  company: string;
  normalized_company: string;
  description: string | null;
  requirements: string | null;
  location: string | null;
  remote_type: string;
  remote_us_eligible: number;
  application_type: string;
  quick_apply: string;
  preferred_apply_url: string | null;
  lifecycle_status: string;
  posted_at: number | null;
  first_seen_at: number;
  last_seen_at: number;
};

type SourceRow = {
  job_id: string;
  source: string;
  source_url: string;
  apply_url: string | null;
};

function openCatalog(catalogPath: string) {
  const db = new Database(catalogPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  return db;
}

function sourceRowsByJob(db: Database.Database, jobIds: string[]) {
  const result = new Map<string, CatalogJobSource[]>();
  if (jobIds.length === 0) return result;

  const placeholders = jobIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT job_id, source, source_url, apply_url
       FROM job_sources
       WHERE job_id IN (${placeholders})
       ORDER BY source ASC, source_url ASC`,
    )
    .all(...jobIds) as SourceRow[];

  for (const row of rows) {
    const entries = result.get(row.job_id) ?? [];
    entries.push({
      source: row.source,
      sourceUrl: row.source_url,
      applyUrl: row.apply_url,
    });
    result.set(row.job_id, entries);
  }

  return result;
}

function toListItem(row: JobRow, sources: CatalogJobSource[]): CatalogJobListItem {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    applicationType: row.application_type,
    quickApply: row.quick_apply,
    lifecycleStatus: row.lifecycle_status,
    preferredApplyUrl: row.preferred_apply_url,
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    sources: [...new Set(sources.map((source) => source.source))],
  };
}

export function listCatalogJobs(args: {
  catalogPath?: string;
  filters?: CatalogJobFilters;
}): CatalogJobListItem[] {
  const catalogPath = args.catalogPath ?? process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
  const filters = args.filters ?? {};
  const db = openCatalog(catalogPath);

  try {
    const rows = db
      .prepare(
        `SELECT
          id, title, normalized_title, company, normalized_company,
          description, requirements, location, remote_type, remote_us_eligible,
          application_type, quick_apply, preferred_apply_url, lifecycle_status,
          posted_at, first_seen_at, last_seen_at
         FROM jobs
         ORDER BY COALESCE(posted_at, first_seen_at) DESC, first_seen_at DESC, id ASC`,
      )
      .all() as JobRow[];

    const sources = sourceRowsByJob(
      db,
      rows.map((row) => row.id),
    );
    const text = filters.text?.trim().toLowerCase();

    return rows
      .filter((row) => {
        const jobSources = sources.get(row.id) ?? [];

        if (text) {
          const haystack = [
            row.title,
            row.company,
            row.location ?? "",
            row.description ?? "",
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(text)) return false;
        }

        if (
          filters.acceptedPosition &&
          !matchesAnyAcceptedPosition(row.title, [filters.acceptedPosition])
        ) {
          return false;
        }

        if (
          filters.source &&
          !jobSources.some((source) => source.source === filters.source)
        ) {
          return false;
        }

        if (
          filters.lifecycleStatus &&
          row.lifecycle_status !== filters.lifecycleStatus
        ) {
          return false;
        }

        if (filters.quickApply && row.quick_apply !== filters.quickApply) {
          return false;
        }

        return true;
      })
      .map((row) => toListItem(row, sources.get(row.id) ?? []));
  } finally {
    db.close();
  }
}

export function getCatalogJob(
  jobId: string,
  catalogPath = process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite",
): CatalogJobDetail | null {
  const db = openCatalog(catalogPath);

  try {
    const row = db
      .prepare(
        `SELECT
          id, title, normalized_title, company, normalized_company,
          description, requirements, location, remote_type, remote_us_eligible,
          application_type, quick_apply, preferred_apply_url, lifecycle_status,
          posted_at, first_seen_at, last_seen_at
         FROM jobs
         WHERE id = ?`,
      )
      .get(jobId) as JobRow | undefined;

    if (!row) return null;

    const sources = sourceRowsByJob(db, [jobId]).get(jobId) ?? [];
    return {
      ...toListItem(row, sources),
      normalizedTitle: row.normalized_title,
      normalizedCompany: row.normalized_company,
      description: row.description,
      requirements: row.requirements,
      remoteType: row.remote_type,
      remoteUsEligible: row.remote_us_eligible === 1,
      sources,
    };
  } finally {
    db.close();
  }
}
