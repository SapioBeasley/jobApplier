import { runAggregation } from "./aggregate";
import { sourceAdapters } from "../sources/registry";

runAggregation({ adapters: sourceAdapters })
  .then((result) => {
    console.log(`Aggregation complete: ${result.runId}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
