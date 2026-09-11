import { writeCatalogManifest } from "./manifest";

const dbPath = process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";
const manifestPath =
  process.env.CATALOG_MANIFEST_PATH ?? "./data/manifest.json";

try {
  const manifest = writeCatalogManifest(dbPath, manifestPath);
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  console.error(error);
  process.exit(1);
}
