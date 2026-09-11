import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { openCatalogDb } from "../db/catalog/client";
import { jobs, jobSources, sourceRuns } from "../db/catalog/schema";
import {
  assertAcceptedPositionsConfigured,
  matchesAcceptedPosition,
} from "../jobs/acceptedPosition";
import { makeNewCanonicalJobId, makeSourceRecordId } from "../jobs/identity";
import { normalizeSourceJob } from "../jobs/normalize";
import type { NormalizedJob } from "../jobs/types";
import type { SourceAdapter } from "../sources/types";

function runRecordId(runId: string, source: string) {
  return `run_${crypto
    .createHash("sha256")
    .update(`${runId}|${source}`)
    .digest("hex")
    .slice(0, 24)}`;
}

async function resolveCanonicalJobId(
  db: ReturnType<typeof openCatalogDb>["db"],
  job: NormalizedJob,
): Promise<string> {
  if (job.sourceJobId) {
    const existingSource = await db
      .select({ jobId: jobSources.jobId })
      .from(jobSources)
      .where(
        and(
          eq(jobSources.source, job.source),
          eq(jobSources.sourceJobId, job.sourceJobId),
        ),
      )
      .limit(1);

    if (existingSource[0]) return existingSource[0].jobId;
  }

  if (job.canonicalApplyUrl) {
    const existingUrl = await db
      .select({ jobId: jobSources.jobId })
      .from(jobSources)
      .where(eq(jobSources.applyUrl, job.canonicalApplyUrl))
      .limit(1);

    if (existingUrl[0]) return existingUrl[0].jobId;

    const existingPreferred = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.preferredApplyUrl, job.canonicalApplyUrl))
      .limit(1);

    if (existingPreferred[0]) return existingPreferred[0].id;
  }

  const dedupeMatches = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.dedupeKey, job.dedupeKey))
    .limit(2);

  if (dedupeMatches.length === 1) return dedupeMatches[0].id;

  return makeNewCanonicalJobId({
    canonicalApplyUrl: job.canonicalApplyUrl,
    source: job.source,
    sourceJobId: job.sourceJobId,
    company: job.company,
    title: job.title,
    location: job.location,
  });
}

async function upsertJob(
  db: ReturnType<typeof openCatalogDb>["db"],
  job: NormalizedJob,
  timestamp: Date,
) {
  const id = await resolveCanonicalJobId(db, job);

  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);

  const values = {
    id,
    title: job.title,
    normalizedTitle: job.normalizedTitle,
    company: job.company,
    normalizedCompany: job.normalizedCompany,
    companyUrl: job.companyUrl ?? null,
    description: job.description ?? null,
    requirements: job.requirements ?? null,
    location: job.location ?? null,
    normalizedLocation: job.normalizedLocation,
    remoteType: job.remoteType ?? "unknown",
    remoteRestrictions: job.remoteRestrictions ?? null,
    remoteUsEligible: job.remoteUsEligible,
    employmentType: job.employmentType ?? null,
    seniority: job.seniority ?? null,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    salaryPeriod: job.salaryPeriod ?? null,
    applicationType: job.applicationType ?? "unknown",
    quickApply: job.quickApply ?? "unknown",
    preferredApplyUrl: job.canonicalApplyUrl ?? job.sourceUrl,
    postedAt: job.postedAt ?? null,
    lastSeenAt: timestamp,
    lifecycleStatus: "active",
    missedRuns: 0,
    dedupeKey: job.dedupeKey,
    updatedAt: timestamp,
  };

  if (existing[0]) {
    await db.update(jobs).set(values).where(eq(jobs.id, id));
  } else {
    await db.insert(jobs).values({
      ...values,
      firstSeenAt: timestamp,
      createdAt: timestamp,
    });
  }

  const sourceRecordId = makeSourceRecordId(
    job.source,
    job.sourceJobId,
    job.sourceUrl,
  );

  await db
    .insert(jobSources)
    .values({
      id: sourceRecordId,
      jobId: id,
      source: job.source,
      sourceJobId: job.sourceJobId ?? null,
      sourceUrl: job.sourceUrl,
      applyUrl: job.canonicalApplyUrl,
      rawData: job.rawData ?? null,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    })
    .onConflictDoUpdate({
      target: jobSources.id,
      set: {
        jobId: id,
        sourceUrl: job.sourceUrl,
        applyUrl: job.canonicalApplyUrl,
        rawData: job.rawData ?? null,
        lastSeenAt: timestamp,
      },
    });

  return existing[0] ? "updated" : "created";
}

export interface AggregationSourceResult {
  source: string;
  status: "success" | "failed";
  fetched: number;
  accepted: number;
  created: number;
  updated: number;
  rejected: number;
}

export interface RunAggregationOptions {
  catalogPath?: string;
  adapters: readonly SourceAdapter[];
  runId?: string;
  timestamp?: Date;
}

export interface AggregationResult {
  runId: string;
  generatedAt: Date;
  sources: AggregationSourceResult[];
}

export async function runAggregation(
  options: RunAggregationOptions,
): Promise<AggregationResult> {
  assertAcceptedPositionsConfigured();

  const enabledAdapters = options.adapters.filter((source) => source.enabled);
  if (enabledAdapters.length === 0) {
    throw new Error(
      "No source adapters are enabled. Implement and enable at least one adapter before publishing a catalog.",
    );
  }

  const { db, sqlite } = openCatalogDb(options.catalogPath);
  const runId = options.runId ?? crypto.randomUUID();
  const timestamp = options.timestamp ?? new Date();
  const sourceResults: AggregationSourceResult[] = [];

  try {
    for (const adapter of enabledAdapters) {
      const sourceRunId = runRecordId(runId, adapter.name);

      await db.insert(sourceRuns).values({
        id: sourceRunId,
        runId,
        source: adapter.name,
        startedAt: timestamp,
        status: "running",
      });

      let fetched = 0;
      let accepted = 0;
      let created = 0;
      let updated = 0;
      let rejected = 0;

      try {
        const rawJobs = await adapter.fetchJobs();
        fetched = rawJobs.length;

        for (const rawJob of rawJobs) {
          const job = normalizeSourceJob(rawJob);

          if (!matchesAcceptedPosition(job.title)) {
            rejected += 1;
            continue;
          }

          if (!job.remoteUsEligible || job.remoteType !== "remote") {
            rejected += 1;
            continue;
          }

          accepted += 1;
          const result = await upsertJob(db, job, timestamp);
          if (result === "created") created += 1;
          else updated += 1;
        }

        await db
          .update(sourceRuns)
          .set({
            completedAt: timestamp,
            status: "success",
            jobsFetched: fetched,
            jobsAccepted: accepted,
            jobsCreated: created,
            jobsUpdated: updated,
            jobsRejected: rejected,
          })
          .where(eq(sourceRuns.id, sourceRunId));

        sourceResults.push({
          source: adapter.name,
          status: "success",
          fetched,
          accepted,
          created,
          updated,
          rejected,
        });
      } catch (error) {
        await db
          .update(sourceRuns)
          .set({
            completedAt: timestamp,
            status: "failed",
            jobsFetched: fetched,
            jobsAccepted: accepted,
            jobsCreated: created,
            jobsUpdated: updated,
            jobsRejected: rejected,
            errorMessage:
              error instanceof Error ? error.stack ?? error.message : String(error),
          })
          .where(eq(sourceRuns.id, sourceRunId));

        sourceResults.push({
          source: adapter.name,
          status: "failed",
          fetched,
          accepted,
          created,
          updated,
          rejected,
        });
      }
    }

    sqlite
      .prepare(
        `INSERT INTO catalog_metadata(key, value)
         VALUES ('last_run_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(runId);

    sqlite
      .prepare(
        `INSERT INTO catalog_metadata(key, value)
         VALUES ('generated_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(timestamp.toISOString());

    return {
      runId,
      generatedAt: timestamp,
      sources: sourceResults,
    };
  } finally {
    sqlite.close();
  }
}
