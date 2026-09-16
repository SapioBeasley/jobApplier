import { runAggregation } from "./aggregate";
import { formatSourceFailure } from "./sourceError";
import { openCatalogDb } from "../db/catalog/client";
import { sourceAdapters } from "../sources/registry";

type SourceRunRow = {
  source: string;
  status: string;
  jobs_fetched: number;
  jobs_accepted: number;
  jobs_created: number;
  jobs_updated: number;
  jobs_rejected: number;
  error_message: string | null;
};

runAggregation({ adapters: sourceAdapters })
  .then((result) => {
    console.log(`Aggregation complete: ${result.runId}`);

    const { sqlite } = openCatalogDb();
    try {
      const rows = sqlite
        .prepare(
          `SELECT source, status, jobs_fetched, jobs_accepted, jobs_created,
                  jobs_updated, jobs_rejected, error_message
           FROM source_runs
           WHERE run_id = ?
           ORDER BY source`,
        )
        .all(result.runId) as SourceRunRow[];

      for (const row of rows) {
        console.log(
          `Source ${row.source}: ${row.status}; fetched=${row.jobs_fetched}; accepted=${row.jobs_accepted}; created=${row.jobs_created}; updated=${row.jobs_updated}; rejected=${row.jobs_rejected}`,
        );
        if (row.error_message) {
          console.error(formatSourceFailure(row.source, row.error_message));
        }
      }
    } finally {
      sqlite.close();
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
