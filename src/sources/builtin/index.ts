import type { SourceAdapter } from "../types";

export const builtinAdapter: SourceAdapter = {
  name: "builtin",
  enabled: false,

  async fetchJobs() {
    // TODO:
    // 1. Check for a permitted structured/API/feed path.
    // 2. Map every returned posting to SourceJob.
    // 3. Set remoteUsEligible conservatively.
    // 4. Set quickApply to yes/no only with evidence; otherwise unknown.
    return [];
  },
};
