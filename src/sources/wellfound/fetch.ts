import type { SourceJob } from "../../jobs/types";
import { parseWellfoundListPage } from "./parser";

const WELLFOUND_ORIGIN = "https://wellfound.com";
const DEFAULT_MAX_PAGES = 25;
const HARD_MAX_PAGES = 50;

export type WellfoundPageFetcher = (url: string) => Promise<string>;

function roleSlug(position: string): string {
  return position.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildWellfoundSearchUrl(position: string, page: number): string {
  const normalizedPage = Math.max(1, Math.floor(page));
  return `${WELLFOUND_ORIGIN}/role/r/${roleSlug(position)}?page=${normalizedPage}`;
}

export async function fetchWellfoundPage(url: string): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; JobApplier/1.0; +https://github.com/SapioBeasley/jobApplier)",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Wellfound request failed (${response.status}) for ${url}`);
  return response.text();
}

export async function collectWellfoundJobs(args: { positions: readonly string[]; fetchPage?: WellfoundPageFetcher; maxPages?: number }): Promise<SourceJob[]> {
  const fetchPage = args.fetchPage ?? fetchWellfoundPage;
  const maxPages = Math.min(HARD_MAX_PAGES, Math.max(1, Math.floor(args.maxPages ?? DEFAULT_MAX_PAGES)));
  const positions = args.positions.map((position) => position.trim()).filter(Boolean);
  const seen = new Set<string>();
  const output: SourceJob[] = [];
  const failures: string[] = [];
  let successfulSeeds = 0;

  for (const position of positions) {
    try {
      for (let page = 1; page <= maxPages; page += 1) {
        const jobs = parseWellfoundListPage(await fetchPage(buildWellfoundSearchUrl(position, page)));
        let added = 0;
        for (const job of jobs) {
          if (seen.has(job.sourceUrl)) continue;
          seen.add(job.sourceUrl);
          output.push(job);
          added += 1;
        }
        if (jobs.length === 0 || added === 0) break;
      }
      successfulSeeds += 1;
    } catch (error) {
      failures.push(`${position}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (positions.length > 0 && successfulSeeds === 0) {
    throw new Error(`All Wellfound search seeds failed: ${failures.join(" | ")}`);
  }
  return output;
}
