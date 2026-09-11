import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),

    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),

    company: text("company").notNull(),
    normalizedCompany: text("normalized_company").notNull(),
    companyUrl: text("company_url"),

    description: text("description"),
    requirements: text("requirements"),

    location: text("location"),
    normalizedLocation: text("normalized_location"),
    remoteType: text("remote_type").notNull().default("remote"),
    remoteRestrictions: text("remote_restrictions"),
    remoteUsEligible: integer("remote_us_eligible", { mode: "boolean" })
      .notNull()
      .default(true),

    employmentType: text("employment_type"),
    seniority: text("seniority"),

    salaryMin: real("salary_min"),
    salaryMax: real("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period"),

    applicationType: text("application_type").notNull().default("unknown"),
    quickApply: text("quick_apply").notNull().default("unknown"),
    preferredApplyUrl: text("preferred_apply_url"),

    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),

    lifecycleStatus: text("lifecycle_status").notNull().default("active"),
    missedRuns: integer("missed_runs").notNull().default(0),

    dedupeKey: text("dedupe_key").notNull(),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("jobs_company_idx").on(t.normalizedCompany),
    index("jobs_title_idx").on(t.normalizedTitle),
    index("jobs_quick_apply_idx").on(t.quickApply),
    index("jobs_last_seen_idx").on(t.lastSeenAt),
    index("jobs_dedupe_key_idx").on(t.dedupeKey),
  ],
);

export const jobSources = sqliteTable(
  "job_sources",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    source: text("source").notNull(),
    sourceJobId: text("source_job_id"),
    sourceUrl: text("source_url").notNull(),
    applyUrl: text("apply_url"),

    rawData: text("raw_data", { mode: "json" }).$type<Record<string, unknown>>(),

    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("job_sources_source_source_job_id_uq").on(
      t.source,
      t.sourceJobId,
    ),
    index("job_sources_job_idx").on(t.jobId),
    index("job_sources_apply_url_idx").on(t.applyUrl),
  ],
);

export const sourceRuns = sqliteTable(
  "source_runs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    source: text("source").notNull(),

    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),

    status: text("status").notNull(),

    jobsFetched: integer("jobs_fetched").notNull().default(0),
    jobsAccepted: integer("jobs_accepted").notNull().default(0),
    jobsCreated: integer("jobs_created").notNull().default(0),
    jobsUpdated: integer("jobs_updated").notNull().default(0),
    jobsRejected: integer("jobs_rejected").notNull().default(0),

    errorMessage: text("error_message"),
  },
  (t) => [
    index("source_runs_run_idx").on(t.runId),
    index("source_runs_source_idx").on(t.source),
  ],
);

export const catalogMetadata = sqliteTable("catalog_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
