import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function openCatalogDb(
  file = process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite",
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
}
