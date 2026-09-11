import type { SourceJob } from "../../jobs/types";
import { parseBuiltInListPage } from "./parser";

const BUILTIN_ORIGIN = "https://builtin.com";
const DEFAULT_MAX_PAGES = 3;
const HARD_MAX_PAGES = 10;

export type BuiltInPageFetcher = (url: string) => Promise<string>;

export function buildBuiltInSearchUrl(position: string, page: number): string {
  const normalizedPage = Math.max(1, Math.floor(page));
  return `${BUILTIN_ORIGIN}/jobs/remote?search=${encodeURIComponent(position)}&page=${normalizedPage}`;
}

export async function fetchBuiltInPage(url: string): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; JobApplier/1.0; +https://github.com/SapioBeasley/jobApplier)",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Built In request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

export async function collectBuiltInJobs(args: {
  positions: readonly string[];
  fetchPage?: BuiltInPageFetcher;
  maxPages?: number;
  now?: Date;
}): Promise<SourceJob[]> {
  const fetchPage = args.fetchPage ?? fetchBuiltInPage;
  const now = args.now ?? new Date();
  const requestedMaxPages = args.maxPages ?? DEFAULT_MAX_PAGES;
  const maxPages = Math.min(
    HARD_MAX_PAGES,
    Math.max(1, Math.floor(requestedMaxPages)),
  );

  const positions = args.positions.map((position) => position.trim()).filter(Boolean);
  const seen = new Set<string>();
  const output: SourceJob[] = [];

  for (const position of positions) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = buildBuiltInSearchUrl(position, page);
      const html = await fetchPage(url);
      const jobs = parseBuiltInListPage(html, now);
      let added = 0;

      for (const job of jobs) {
        if (seen.has(job.sourceUrl)) continue;
        seen.add(job.sourceUrl);
        output.push(job);
        added += 1;
      }

      // Built In can return an empty page at the end of pagination. A page that
      // contains only jobs already seen also means we have reached an overlapping
      // tail and should not keep requesting pages unnecessarily.
      if (jobs.length === 0 || added === 0) break;
    }
  }

  return output;
}
