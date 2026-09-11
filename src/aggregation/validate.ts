import Database from "better-sqlite3";

export interface CatalogValidationResult {
  ok: true;
  jobCount: number;
  activeJobCount: number;
  sourceCount: number;
  orphanCount: number;
  duplicateIds: number;
  unsafeJobCount: number;
  latestRunId: string;
  latestSourceCount: number;
  successfulLatestSources: number;
  failedLatestSources: number;
}

function count(
  db: Database.Database,
  sql: string,
  ...params: unknown[]
): number {
  return (db.prepare(sql).get(...params) as { count: number }).count;
}

export function validateCatalog(file: string): CatalogValidationResult {
  const db = new Database(file, { readonly: true });

  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(`SQLite integrity_check failed: ${integrity}`);
    }

    const jobCount = count(db, "SELECT COUNT(*) AS count FROM jobs");
    if (jobCount === 0) {
      throw new Error("Catalog contains no jobs");
    }

    const activeJobCount = count(
      db,
      "SELECT COUNT(*) AS count FROM jobs WHERE lifecycle_status = 'active'",
    );

    const sourceCount = count(
      db,
      "SELECT COUNT(DISTINCT source) AS count FROM job_sources",
    );
    if (sourceCount === 0) {
      throw new Error("Catalog contains jobs but no job source records");
    }

    const orphanCount = count(
      db,
      `SELECT COUNT(*) AS count
       FROM job_sources s
       LEFT JOIN jobs j ON j.id = s.job_id
       WHERE j.id IS NULL`,
    );
    if (orphanCount > 0) {
      throw new Error(`Found ${orphanCount} orphaned job_sources rows`);
    }

    const duplicateIds = count(
      db,
      `SELECT COUNT(*) AS count
       FROM (
         SELECT id
         FROM jobs
         GROUP BY id
         HAVING COUNT(*) > 1
       )`,
    );
    if (duplicateIds > 0) {
      throw new Error(`Found ${duplicateIds} duplicate canonical job IDs`);
    }

    const unsafeJobCount = count(
      db,
      `SELECT COUNT(*) AS count
       FROM jobs
       WHERE remote_us_eligible != 1 OR remote_type != 'remote'`,
    );
    if (unsafeJobCount > 0) {
      throw new Error(
        `Found ${unsafeJobCount} catalog jobs without confirmed remote-US eligibility`,
      );
    }

    const metadataRows = db
      .prepare(
        "SELECT key, value FROM catalog_metadata WHERE key IN ('last_run_id','generated_at')",
      )
      .all() as { key: string; value: string }[];
    const metadata = Object.fromEntries(
      metadataRows.map((row) => [row.key, row.value]),
    ) as Record<string, string>;

    const latestRunId = metadata.last_run_id;
    if (!latestRunId) {
      throw new Error("Catalog metadata is missing last_run_id");
    }

    const generatedAt = metadata.generated_at;
    if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
      throw new Error("Catalog metadata has an invalid generated_at timestamp");
    }

    const latestSourceCount = count(
      db,
      "SELECT COUNT(*) AS count FROM source_runs WHERE run_id = ?",
      latestRunId,
    );
    if (latestSourceCount === 0) {
      throw new Error("Latest aggregation run has no source run records");
    }

    const runningLatestSources = count(
      db,
      "SELECT COUNT(*) AS count FROM source_runs WHERE run_id = ? AND status = 'running'",
      latestRunId,
    );
    if (runningLatestSources > 0) {
      throw new Error("Latest aggregation run is incomplete");
    }

    const successfulLatestSources = count(
      db,
      "SELECT COUNT(*) AS count FROM source_runs WHERE run_id = ? AND status = 'success'",
      latestRunId,
    );
    if (successfulLatestSources === 0) {
      throw new Error("Latest aggregation run has no successful sources");
    }

    const failedLatestSources = count(
      db,
      "SELECT COUNT(*) AS count FROM source_runs WHERE run_id = ? AND status = 'failed'",
      latestRunId,
    );

    return {
      ok: true,
      jobCount,
      activeJobCount,
      sourceCount,
      orphanCount,
      duplicateIds,
      unsafeJobCount,
      latestRunId,
      latestSourceCount,
      successfulLatestSources,
      failedLatestSources,
    };
  } finally {
    db.close();
  }
}
