import type { SourceJob } from "../jobs/types";

export interface SourceAdapter {
  readonly name: string;
  readonly enabled: boolean;

  /**
   * Prefer, in order:
   * 1. Official API
   * 2. Authorized/public feed
   * 3. Structured page data
   * 4. Normal HTTP retrieval
   * 5. Puppeteer
   *
   * Do not bypass authentication, CAPTCHAs, access controls, or source rules.
   */
  fetchJobs(): Promise<SourceJob[]>;
}
