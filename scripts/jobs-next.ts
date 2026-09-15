import { getNextJobs } from "../src/codex/jobsNext";

function parseLimit(argv: string[]) {
  const inline = argv.find((arg) => arg.startsWith("--limit="));
  if (inline) return Number(inline.slice("--limit=".length));

  const index = argv.indexOf("--limit");
  if (index >= 0) return Number(argv[index + 1]);

  return 10;
}

async function main() {
  try {
    const result = await getNextJobs({ limit: parseLimit(process.argv.slice(2)) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ error: message }));
    process.exitCode = 1;
  }
}

void main();
