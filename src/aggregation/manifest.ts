import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
const manifestPath = process.env.CATALOG_MANIFEST_PATH ?? "./data/manifest.json";

const bytes = fs.readFileSync(dbPath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

const db = new Database(dbPath, { readonly: true });

try {
  const jobCount = (
    db.prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number }
  ).count;

  const activeJobCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM jobs WHERE lifecycle_status = 'active'",
      )
      .get() as { count: number }
  ).count;

  const sourceCount = (
    db
      .prepare("SELECT COUNT(DISTINCT source) AS count FROM job_sources")
      .get() as { count: number }
  ).count;

  const metadata = db
    .prepare(
      "SELECT key, value FROM catalog_metadata WHERE key IN ('generated_at','last_run_id')",
    )
    .all() as { key: string; value: string }[];

  const meta = Object.fromEntries(metadata.map((row) => [row.key, row.value]));

  const manifest = {
    schemaVersion: 1,
    generatedAt: meta.generated_at ?? new Date().toISOString(),
    runId: meta.last_run_id ?? null,
    jobCount,
    activeJobCount,
    sourceCount,
    sha256,
    database: "catalog.sqlite.gz",
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(JSON.stringify(manifest, null, 2));
} finally {
  db.close();
}
