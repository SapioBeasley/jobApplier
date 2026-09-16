// Wellfound discovery uses broad role seeds; accepted-position filtering remains
// downstream so this adapter only discovers and normalizes public source data.
export const wellfoundSearchPositions = [
  "project manager",
  "technical project manager",
  "program manager",
  "project coordinator",
  "program coordinator",
  "implementation manager",
  "delivery manager",
  "project lead",
  "program lead",
  "pmo manager",
] as const;
