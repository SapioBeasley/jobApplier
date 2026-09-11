import type { SourceAdapter } from "../types";

export const globalworkAdapter: SourceAdapter = {
  name: "globalwork",
  enabled: false,

  async fetchJobs() {
    // TODO: implement using the best permitted retrieval method.
    return [];
  },
};
