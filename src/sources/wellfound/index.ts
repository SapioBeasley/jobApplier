import type { SourceAdapter } from "../types";
import { collectWellfoundJobs } from "./fetch";
import { wellfoundSearchPositions } from "./searchPositions";

export const wellfoundAdapter: SourceAdapter = {
  name: "wellfound",
  enabled: true,

  async fetchJobs() {
    return collectWellfoundJobs({ positions: wellfoundSearchPositions });
  },
};
