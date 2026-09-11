import type { ApplicationAdapter } from "./types";

/**
 * Register supported Quick/Easy Apply implementations here.
 *
 * Keep this empty until a concrete application flow is implemented and tested.
 * The runner will safely mark jobs needs_review when no adapter can handle them.
 */
export const applicationAdapters: ApplicationAdapter[] = [];

export async function findApplicationAdapter(url: string) {
  for (const adapter of applicationAdapters) {
    if (await adapter.canHandle(url)) return adapter;
  }

  return null;
}
