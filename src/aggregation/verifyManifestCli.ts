import fs from "node:fs";
import { verifyCatalogManifest, type CatalogManifest } from "./manifest";

const dbPath = process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
const manifestPath =
  process.env.CATALOG_MANIFEST_PATH ?? "./data/manifest.json";

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as CatalogManifest;
  verifyCatalogManifest(dbPath, manifest);
  console.log("Catalog manifest verified");
} catch (error) {
  console.error(error);
  process.exit(1);
}
