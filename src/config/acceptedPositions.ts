/**
 * Only jobs whose normalized title matches at least one accepted position
 * will be stored in the catalog.
 *
 * Matching is phrase-based after normalization:
 * - "product manager" matches "Senior Product Manager"
 * - "software engineer" matches "Staff Software Engineer, Backend"
 *
 * Keep this intentionally explicit. An empty array causes aggregation to fail
 * rather than silently ingesting every job.
 */
export const acceptedPositions = [
  // "product manager",
  // "software engineer",
] as const;
