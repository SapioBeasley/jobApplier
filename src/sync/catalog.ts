import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import Database from "better-sqlite3";

const gunzipAsync = promisify(gunzip);

export type CatalogManifest = {
  schemaVersion: number;
  generatedAt: string;
  runId: string | null;
  jobCount: number;
  activeJobCount: number;
  sourceCount: number;
  sha256: string;
  database: string;
};

export type CatalogSyncResult = {
  status: "updated" | "current";
  manifest: CatalogManifest;
};

type Download = (url: string) => Promise<Buffer>;

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function sha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function existingGeneratedAt(catalogPath: string): Promise<string | null> {
  try {
    await fs.access(catalogPath);
  } catch {
    return null;
  }

  const db = new Database(catalogPath, { readonly: true, fileMustExist: true });
  try {
    const row = db
      .prepare("SELECT value FROM catalog_metadata WHERE key = 'generated_at'")
      .get() as { value?: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function assertManifest(manifest: CatalogManifest) {
  if (!manifest.generatedAt || Number.isNaN(Date.parse(manifest.generatedAt))) {
    throw new Error("Catalog manifest has an invalid generatedAt timestamp");
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error("Catalog manifest has an invalid SHA-256");
  }
}

export async function syncCatalog(args: {
  manifestUrl: string;
  databaseUrl: string;
  catalogPath?: string;
  download?: Download;
}): Promise<CatalogSyncResult> {
  const catalogPath = args.catalogPath ?? "./data/catalog.sqlite";
  const tempPath = `${catalogPath}.tmp`;
  const downloader = args.download ?? download;

  const manifest = JSON.parse(
    (await downloader(args.manifestUrl)).toString("utf8"),
  ) as CatalogManifest;
  assertManifest(manifest);

  const currentGeneratedAt = await existingGeneratedAt(catalogPath);
  if (
    currentGeneratedAt &&
    !Number.isNaN(Date.parse(currentGeneratedAt)) &&
    Date.parse(currentGeneratedAt) >= Date.parse(manifest.generatedAt)
  ) {
    return { status: "current", manifest };
  }

  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.rm(tempPath, { force: true });

  try {
    const compressed = await downloader(args.databaseUrl);
    const uncompressed = Buffer.from(await gunzipAsync(compressed));

    if (sha256(uncompressed) !== manifest.sha256) {
      throw new Error("Catalog SHA-256 mismatch");
    }

    await fs.writeFile(tempPath, uncompressed);

    const db = new Database(tempPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = db.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") {
        throw new Error(`Invalid catalog: ${integrity}`);
      }
    } finally {
      db.close();
    }

    await fs.rename(tempPath, catalogPath);
    return { status: "updated", manifest };
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}
