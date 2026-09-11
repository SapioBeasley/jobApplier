import { validateCatalog } from "./validate";

const file = process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite";

try {
  console.log(JSON.stringify(validateCatalog(file), null, 2));
} catch (error) {
  console.error(error);
  process.exit(1);
}
