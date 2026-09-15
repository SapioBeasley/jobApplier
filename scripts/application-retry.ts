import { resetNeedsReview } from "../src/codex/retryApplication";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

try {
  const jobId = arg("--job-id");
  if (!jobId) throw new Error("--job-id <canonical-job-id> is required");
  const result = resetNeedsReview({ jobId });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
}
