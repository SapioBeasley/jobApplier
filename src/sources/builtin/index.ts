import { acceptedPositions } from "../../config/acceptedPositions";
import type { SourceAdapter } from "../types";
import { collectBuiltInJobs } from "./fetch";

export const builtinAdapter: SourceAdapter = {
  name: "builtin",
  // Enable only after the explicit live smoke check for issue #3 passes.
  enabled: false,

  async fetchJobs() {
    return collectBuiltInJobs({
      positions: acceptedPositions,
      maxPages: 3,
    });
  },
};
