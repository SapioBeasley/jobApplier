import { runNextApplication } from "./runner";

export async function runApplicationQueue(args?: {
  shouldStop?: () => boolean | Promise<boolean>;
  maxJobs?: number;
}) {
  const counts = {
    applied: 0,
    needsReview: 0,
    failed: 0,
  };

  let processed = 0;

  while (args?.maxJobs == null || processed < args.maxJobs) {
    if (await args?.shouldStop?.()) break;

    const result = await runNextApplication();
    if (result.status === "empty") break;

    processed += 1;
    if (result.status === "applied") counts.applied += 1;
    if (result.status === "needs_review") counts.needsReview += 1;
    if (result.status === "failed") counts.failed += 1;
  }

  return { processed, ...counts };
}
