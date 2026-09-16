import type { SourceAdapter } from "../types";
import { collectBuiltInJobs } from "./fetch";
import { builtInSearchPositions } from "./searchPositions";

export const builtinAdapter: SourceAdapter = {
  name: "builtin",
  enabled: true,

  async fetchJobs() {
    return collectBuiltInJobs({
      positions: builtInSearchPositions,
    });
  },
};
