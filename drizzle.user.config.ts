import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/user/schema.ts",
  out: "./drizzle/user",
  dbCredentials: {
    url: process.env.USER_DB_PATH ?? "./data/user.sqlite",
  },
});
