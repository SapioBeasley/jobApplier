import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { syncCatalog } from "../src/sync/catalog";

const tempDirs: string[] = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-sync-"));
  tempDirs.push(dir);
  return dir;
}

function createCatalog(file: string, generatedAt: string, marker: string) {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE jobs (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    INSERT INTO catalog_metadata(key, value) VALUES ('generated_at', '${generatedAt}');
    INSERT INTO catalog_metadata(key, value) VALUES ('last_run_id', 'run-${marker}');
    INSERT INTO jobs(id, title) VALUES ('${marker}', '${marker}');
  `);
  db.close();
}

function manifestFor(buffer: Buffer, generatedAt: string) {
  return {
    schemaVersion: 1,
    generatedAt,
    runId: "remote-run",
    jobCount: 1,
    activeJobCount: 1,
    sourceCount: 1,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    database: "catalog.sqlite.gz",
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("syncCatalog", () => {
  it("atomically replaces an older catalog with a newer verified release", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const remotePath = path.join(dir, "remote.sqlite");
    createCatalog(catalogPath, "2026-09-10T10:00:00.000Z", "old");
    createCatalog(remotePath, "2026-09-11T10:00:00.000Z", "new");

    const remoteBytes = await fsp.readFile(remotePath);
    const manifest = manifestFor(remoteBytes, "2026-09-11T10:00:00.000Z");
    const payloads = new Map([
      ["manifest", Buffer.from(JSON.stringify(manifest))],
      ["database", gzipSync(remoteBytes)],
    ]);

    const result = await syncCatalog({
      manifestUrl: "manifest",
      databaseUrl: "database",
      catalogPath,
      download: async (url) => payloads.get(url)!,
    });

    expect(result.status).toBe("updated");
    const db = new Database(catalogPath, { readonly: true });
    expect(db.prepare("SELECT title FROM jobs").get()).toEqual({ title: "new" });
    db.close();
  });

  it("does not replace a working catalog when the remote release is not newer", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const remotePath = path.join(dir, "remote.sqlite");
    createCatalog(catalogPath, "2026-09-11T10:00:00.000Z", "current");
    createCatalog(remotePath, "2026-09-10T10:00:00.000Z", "older");

    const remoteBytes = await fsp.readFile(remotePath);
    const manifest = manifestFor(remoteBytes, "2026-09-10T10:00:00.000Z");
    let databaseDownloads = 0;

    const result = await syncCatalog({
      manifestUrl: "manifest",
      databaseUrl: "database",
      catalogPath,
      download: async (url) => {
        if (url === "manifest") return Buffer.from(JSON.stringify(manifest));
        databaseDownloads += 1;
        return gzipSync(remoteBytes);
      },
    });

    expect(result.status).toBe("current");
    expect(databaseDownloads).toBe(0);
    const db = new Database(catalogPath, { readonly: true });
    expect(db.prepare("SELECT title FROM jobs").get()).toEqual({ title: "current" });
    db.close();
  });

  it("preserves the working catalog when SHA verification fails", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const remotePath = path.join(dir, "remote.sqlite");
    createCatalog(catalogPath, "2026-09-10T10:00:00.000Z", "safe");
    createCatalog(remotePath, "2026-09-11T10:00:00.000Z", "bad");

    const remoteBytes = await fsp.readFile(remotePath);
    const manifest = {
      ...manifestFor(remoteBytes, "2026-09-11T10:00:00.000Z"),
      sha256: "0".repeat(64),
    };

    await expect(
      syncCatalog({
        manifestUrl: "manifest",
        databaseUrl: "database",
        catalogPath,
        download: async (url) =>
          url === "manifest"
            ? Buffer.from(JSON.stringify(manifest))
            : gzipSync(remoteBytes),
      }),
    ).rejects.toThrow("Catalog SHA-256 mismatch");

    const db = new Database(catalogPath, { readonly: true });
    expect(db.prepare("SELECT title FROM jobs").get()).toEqual({ title: "safe" });
    db.close();
  });

  it("never touches user.sqlite while replacing catalog.sqlite", async () => {
    const dir = tempDir();
    const catalogPath = path.join(dir, "catalog.sqlite");
    const remotePath = path.join(dir, "remote.sqlite");
    const userPath = path.join(dir, "user.sqlite");
    createCatalog(catalogPath, "2026-09-10T10:00:00.000Z", "old");
    createCatalog(remotePath, "2026-09-11T10:00:00.000Z", "new");
    await fsp.writeFile(userPath, "private-user-ledger");
    const before = await fsp.readFile(userPath);

    const remoteBytes = await fsp.readFile(remotePath);
    const manifest = manifestFor(remoteBytes, "2026-09-11T10:00:00.000Z");

    await syncCatalog({
      manifestUrl: "manifest",
      databaseUrl: "database",
      catalogPath,
      download: async (url) =>
        url === "manifest"
          ? Buffer.from(JSON.stringify(manifest))
          : gzipSync(remoteBytes),
    });

    expect(await fsp.readFile(userPath)).toEqual(before);
  });
});
