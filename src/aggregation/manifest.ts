import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface CatalogManifest {
  schemaVersion: number;
  generatedAt: string;
  runId: string;
  jobCount: number;
  activeJobCount: number;
  sourceCount: number;
  sha256: string;
  database: "catalog.sqlite.gz";
}

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readCatalogFacts(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });

  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(`SQLite integrity_check failed: ${integrity}`);
    }

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

    const meta = Object.fromEntries(metadata.map((row) => [row.key, row.value])) as Record<
      string,
      string
    >;

    if (!meta.generated_at || Number.isNaN(Date.parse(meta.generated_at))) {
      throw new Error("Catalog metadata has an invalid generated_at timestamp");
    }
    if (!meta.last_run_id) {
      throw new Error("Catalog metadata is missing last_run_id");
    }

    return {
      generatedAt: meta.generated_at,
      runId: meta.last_run_id,
      jobCount,
      activeJobCount,
      sourceCount,
    };
  } finally {
    db.close();
  }
}

export function generateCatalogManifest(dbPath: string): CatalogManifest {
  const facts = readCatalogFacts(dbPath);

  return {
    schemaVersion: 1,
    generatedAt: facts.generatedAt,
    runId: facts.runId,
    jobCount: facts.jobCount,
    activeJobCount: facts.activeJobCount,
    sourceCount: facts.sourceCount,
    sha256: sha256File(dbPath),
    database: "catalog.sqlite.gz",
  };
}

export function writeCatalogManifest(
  dbPath: string,
  manifestPath: string,
): CatalogManifest {
  const manifest = generateCatalogManifest(dbPath);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function verifyCatalogManifest(
  dbPath: string,
  manifest: CatalogManifest,
): true {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported catalog schema version: ${manifest.schemaVersion}`);
  }

  const actualSha = sha256File(dbPath);
  if (actualSha !== manifest.sha256) {
    throw new Error("Catalog SHA-256 mismatch");
  }

  const facts = readCatalogFacts(dbPath);
  if (
    facts.generatedAt !== manifest.generatedAt ||
    facts.runId !== manifest.runId ||
    facts.jobCount !== manifest.jobCount ||
    facts.activeJobCount !== manifest.activeJobCount ||
    facts.sourceCount !== manifest.sourceCount
  ) {
    throw new Error("Catalog manifest metadata does not match database contents");
  }

  return true;
}
