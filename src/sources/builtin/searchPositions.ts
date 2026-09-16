// Built In discovery intentionally uses broad search seeds instead of every
// accepted title. Acceptance remains governed by acceptedPositions after fetch.
// Keeping these concerns separate prevents a wider allowlist from multiplying
// outbound Built In requests unnecessarily.
export const builtInSearchPositions = [
  "project manager",
  "program manager",
  "project coordinator",
  "program coordinator",
  "project management specialist",
  "implementation manager",
  "delivery manager",
  "portfolio manager",
  "process improvement manager",
  "continuous improvement manager",
  "project lead",
  "program lead",
  "pmo manager",
] as const;
