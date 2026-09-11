import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/catalog/schema.ts",
  out: "./drizzle/catalog",
  dbCredentials: {
    url: process.env.CATALOG_DB_PATH ?? "./data/catalog.sqlite",
  },
});
