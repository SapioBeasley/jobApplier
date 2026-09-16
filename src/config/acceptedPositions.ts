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
  "senior project manager",
  "program manager",
  "senior program manager",
  "project coordinator",
  "program coordinator",
  "project management specialist",
  "technical project manager",
  "implementation project manager",
  "implementation manager",
  "operations project manager",
  "operations program manager",
  "business project manager",
  "strategic project manager",
  "pmo project manager",
  "pmo manager",
  "project delivery manager",
  "delivery manager",
  "client project manager",
  "portfolio manager",
  "portfolio project manager",
  "transformation project manager",
  "change management project manager",
  "process improvement manager",
  "continuous improvement manager",
  "agile project manager",
  "project lead",
  "program lead",
] as const;
