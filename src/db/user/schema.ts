import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const candidateProfiles = sqliteTable("candidate_profiles", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  city: text("city"),
  state: text("state"),
  country: text("country").notNull().default("US"),
  linkedinUrl: text("linkedin_url"),
  portfolioUrl: text("portfolio_url"),
  workAuthorizedUs: integer("work_authorized_us", { mode: "boolean" }),
  requiresSponsorship: integer("requires_sponsorship", { mode: "boolean" }),
  yearsExperience: integer("years_experience"),
  desiredSalary: integer("desired_salary"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const jobStatus = sqliteTable(
  "job_status",
  {
    jobId: text("job_id").primaryKey(),
    status: text("status").notNull().default("new"),

    savedAt: integer("saved_at", { mode: "timestamp_ms" }),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
    skippedAt: integer("skipped_at", { mode: "timestamp_ms" }),

    notes: text("notes"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("job_status_status_idx").on(t.status)],
);

export const jobStatusHistory = sqliteTable(
  "job_status_history",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    previousStatus: text("previous_status"),
    newStatus: text("new_status").notNull(),
    changedAt: integer("changed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("job_status_history_job_idx").on(t.jobId)],
);

export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  filename: text("filename").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const savedAnswers = sqliteTable(
  "saved_answers",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    questionPattern: text("question_pattern").notNull(),
    answer: text("answer").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("saved_answers_key_uq").on(t.key)],
);

export const applicationQueue = sqliteTable(
  "application_queue",
  {
    jobId: text("job_id").primaryKey(),
    state: text("state").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    queuedAt: integer("queued_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    reviewReason: text("review_reason"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("application_queue_state_idx").on(t.state),
    index("application_queue_priority_idx").on(t.priority, t.queuedAt),
  ],
);

export const applicationAttempts = sqliteTable(
  "application_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    adapter: text("adapter"),
    status: text("status").notNull(),
    applicationUrl: text("application_url").notNull(),
    applicationType: text("application_type"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
  },
  (t) => [
    index("application_attempts_job_idx").on(t.jobId),
    index("application_attempts_status_idx").on(t.status),
  ],
);

export const applicationAnswers = sqliteTable(
  "application_answers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => applicationAttempts.id, { onDelete: "cascade" }),
    questionKey: text("question_key"),
    questionText: text("question_text").notNull(),
    answerValue: text("answer_value").notNull(),
    answerSource: text("answer_source").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("application_answers_attempt_idx").on(t.attemptId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
