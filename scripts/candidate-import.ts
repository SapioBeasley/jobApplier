import fs from "node:fs";
import path from "node:path";
import { importCandidateFacts, type CandidateFactsInput } from "../src/codex/candidateFacts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

try {
  const file = arg("--file");
  if (!file) throw new Error("--file <json> is required");
  const resolved = path.resolve(file);
  const payload = JSON.parse(fs.readFileSync(resolved, "utf8")) as CandidateFactsInput;
  const result = importCandidateFacts(payload);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
}
