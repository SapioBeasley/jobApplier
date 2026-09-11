export type QuickApply = "yes" | "no" | "unknown";

export type ApplicationType =
  | "quick_apply"
  | "easy_apply"
  | "external_form"
  | "company_ats"
  | "email"
  | "unknown";

export interface SourceJob {
  source: string;
  sourceJobId?: string | null;
  sourceUrl: string;

  title: string;
  company: string;
  companyUrl?: string | null;

  description?: string | null;
  requirements?: string | null;

  location?: string | null;
  remoteType?: "remote" | "hybrid" | "onsite" | "unknown";
  remoteRestrictions?: string | null;
  remoteUsEligible: boolean;

  employmentType?: string | null;
  seniority?: string | null;

  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;

  applicationType?: ApplicationType;
  quickApply?: QuickApply;
  applyUrl?: string | null;

  postedAt?: Date | null;

  rawData?: Record<string, unknown>;
}

export interface NormalizedJob extends SourceJob {
  normalizedTitle: string;
  normalizedCompany: string;
  normalizedLocation: string;
  canonicalApplyUrl: string | null;
  dedupeKey: string;
}
