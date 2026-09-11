import { acceptedPositions } from "../../config/acceptedPositions";
import type { SourceAdapter } from "../types";
import { collectBuiltInJobs } from "./fetch";

export const builtinAdapter: SourceAdapter = {
  name: "builtin",
  enabled: true,

  async fetchJobs() {
    return collectBuiltInJobs({
      positions: acceptedPositions,
      maxPages: 3,
    });
  },
};
