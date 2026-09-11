import type { SourceAdapter } from "../types";

export const remoteCoAdapter: SourceAdapter = {
  name: "remote-co",
  enabled: false,

  async fetchJobs() {
    // Intentionally disabled until an authorized/permitted programmatic
    // ingestion path is established for this source.
    return [];
  },
};
