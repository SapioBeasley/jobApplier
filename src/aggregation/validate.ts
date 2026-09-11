import Database from "better-sqlite3";

const file = process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
const db = new Database(file, { readonly: true });

try {
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    throw new Error(`SQLite integrity_check failed: ${integrity}`);
  }

  const jobCount = (
    db.prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number }
  ).count;

  const orphanCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM job_sources s
         LEFT JOIN jobs j ON j.id = s.job_id
         WHERE j.id IS NULL`,
      )
      .get() as { count: number }
  ).count;

  const duplicateIds = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM (
           SELECT id
           FROM jobs
           GROUP BY id
           HAVING COUNT(*) > 1
         )`,
      )
      .get() as { count: number }
  ).count;

  if (orphanCount > 0) {
    throw new Error(`Found ${orphanCount} orphaned job_sources rows`);
  }

  if (duplicateIds > 0) {
    throw new Error(`Found ${duplicateIds} duplicate canonical job IDs`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        jobCount,
        orphanCount,
        duplicateIds,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
