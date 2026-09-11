import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import JobsPage from "../src/app/jobs/page";
import JobDetailPage from "../src/app/jobs/[jobId]/page";

const tempDirs: string[] = [];
const originalCatalogPath = process.env.CATALOG_DB_PATH;

function createCatalog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-ui-"));
  tempDirs.push(dir);
  const file = path.join(dir, "catalog.sqlite");
  const db = new Database(file);
  db.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      company TEXT NOT NULL,
      normalized_company TEXT NOT NULL,
      description TEXT,
      requirements TEXT,
      location TEXT,
      remote_type TEXT NOT NULL,
      remote_us_eligible INTEGER NOT NULL,
      application_type TEXT NOT NULL,
      quick_apply TEXT NOT NULL,
      preferred_apply_url TEXT,
      lifecycle_status TEXT NOT NULL,
      posted_at INTEGER,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE job_sources (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      apply_url TEXT
    );
    INSERT INTO jobs VALUES (
      'job-1', 'Senior Project Manager', 'senior project manager',
      'Acme', 'acme', 'Lead enterprise projects.', 'PMP preferred.',
      'United States', 'remote', 1, 'easy_apply', 'yes',
      'https://apply.example/job-1', 'active', 2000, 1000, 3000
    );
    INSERT INTO job_sources VALUES (
      'source-1', 'job-1', 'builtin', 'https://builtin.com/job-1',
      'https://apply.example/job-1'
    );
  `);
  db.close();
  return file;
}

afterEach(() => {
  if (originalCatalogPath === undefined) delete process.env.CATALOG_DB_PATH;
  else process.env.CATALOG_DB_PATH = originalCatalogPath;

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Jobs UI", () => {
  it("renders real catalog jobs, active filters, and the server-side sync control", async () => {
    process.env.CATALOG_DB_PATH = createCatalog();
    const element = await JobsPage({
      searchParams: Promise.resolve({ q: "Acme", quickApply: "yes" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Senior Project Manager");
    expect(html).toContain("Acme");
    expect(html).toContain("Quick / Easy Apply");
    expect(html).toContain("View job");
    expect(html).toContain("Sync catalog");
    expect(html).toContain('action="/api/catalog/sync"');
    expect(html).toContain('method="post"');
  });

  it("renders normalized detail fields and source/apply links", async () => {
    process.env.CATALOG_DB_PATH = createCatalog();
    const element = await JobDetailPage({
      params: Promise.resolve({ jobId: "job-1" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Senior Project Manager");
    expect(html).toContain("Lead enterprise projects.");
    expect(html).toContain("PMP preferred.");
    expect(html).toContain("Built In source");
    expect(html).toContain("Apply");
  });
});
