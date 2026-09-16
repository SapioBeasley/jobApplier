export function formatSourceFailure(source: string, error: unknown): string {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  return `[${source}] ${message}`;
}
