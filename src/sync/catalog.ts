import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import Database from "better-sqlite3";

type CatalogManifest = {
  schemaVersion: number;
  generatedAt: string;
  runId: string | null;
  jobCount: number;
  activeJobCount: number;
  sourceCount: number;
  sha256: string;
  database: string;
};

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function gunzipBuffer(buffer: Buffer, target: string) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmpGz = `${target}.download.gz`;
  await fs.writeFile(tmpGz, buffer);

  await pipeline(
    Readable.from(buffer),
    createGunzip(),
    (await import("node:fs")).createWriteStream(target),
  );

  await fs.rm(tmpGz, { force: true });
}

function sha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function syncCatalog(args: {
  manifestUrl: string;
  databaseUrl: string;
  catalogPath?: string;
}) {
  const catalogPath = args.catalogPath ?? "./data/catalog.sqlite";
  const tempPath = `${catalogPath}.tmp`;

  const manifest = JSON.parse(
    (await download(args.manifestUrl)).toString("utf8"),
  ) as CatalogManifest;

  const gz = await download(args.databaseUrl);
  await gunzipBuffer(gz, tempPath);

  const uncompressed = await fs.readFile(tempPath);
  if (sha256(uncompressed) !== manifest.sha256) {
    await fs.rm(tempPath, { force: true });
    throw new Error("Catalog SHA-256 mismatch");
  }

  const db = new Database(tempPath, { readonly: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Invalid catalog: ${integrity}`);
  } finally {
    db.close();
  }

  await fs.rename(tempPath, catalogPath);
  return manifest;
}
