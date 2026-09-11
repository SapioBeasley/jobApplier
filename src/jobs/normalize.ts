import type { NormalizedJob, SourceJob } from "./types";
import {
  canonicalizeUrl,
  makeDedupeKey,
  normalizeCompany,
  normalizeText,
} from "./identity";

export function normalizeSourceJob(job: SourceJob): NormalizedJob {
  const canonicalApplyUrl = canonicalizeUrl(job.applyUrl);

  return {
    ...job,
    normalizedTitle: normalizeText(job.title),
    normalizedCompany: normalizeCompany(job.company),
    normalizedLocation: normalizeText(job.location),
    canonicalApplyUrl,
    dedupeKey: makeDedupeKey({
      company: job.company,
      title: job.title,
      location: job.location,
    }),
    remoteType: job.remoteType ?? "unknown",
    applicationType: job.applicationType ?? "unknown",
    quickApply: job.quickApply ?? "unknown",
  };
}
