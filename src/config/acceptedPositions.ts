/**
 * Only jobs whose normalized title matches at least one accepted position
 * will be stored in the catalog.
 *
 * Matching is phrase-based after normalization. For example:
 * - "project manager" matches "Senior Project Manager"
 * - "program manager" matches "Technical Program Manager"
 *
 * Keep this intentionally explicit. An empty array causes aggregation to fail
 * rather than silently ingesting every job.
 */
export const acceptedPositions = [
  "project manager",
  "program manager",
  "project coordinator",
  "project management specialist",
] as const;
