import {
  recordApplicationResult,
  type ApplicationResultStatus,
} from "../src/codex/applicationResult";

function readFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
}

try {
  const args = process.argv.slice(2);
  const jobId = readFlag(args, "job-id");
  const status = readFlag(args, "status");
  const reason = readFlag(args, "reason");

  if (!jobId) throw new Error("--job-id is required");
  if (!status) throw new Error("--status is required");

  const result = recordApplicationResult({
    jobId,
    status: status as ApplicationResultStatus,
    reason,
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
}
