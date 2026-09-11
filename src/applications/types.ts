export type QueueState =
  | "queued"
  | "applying"
  | "applied"
  | "needs_review"
  | "failed"
  | "skipped";

export type ApplicationResult =
  | {
      status: "submitted";
      submittedAt: Date;
    }
  | {
      status: "needs_review";
      reason: string;
    }
  | {
      status: "failed";
      code: string;
      message: string;
    };

export interface CandidateProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  workAuthorizedUs?: boolean | null;
  requiresSponsorship?: boolean | null;
  yearsExperience?: number | null;
  desiredSalary?: number | null;
}

export interface ApplicationJob {
  id: string;
  title: string;
  company: string;
  applicationUrl: string;
  applicationType: string;
  quickApply: string;
}

export interface ApplicationContext {
  job: ApplicationJob;
  candidate: CandidateProfile;
  resumePath: string;
  savedAnswers: Record<string, string>;
  /**
   * V1 rule: adapters may submit only when every required field is known.
   * Unknown questions, CAPTCHAs, assessments, or ambiguous fields must return
   * needs_review instead of guessing.
   */
  allowSubmit: boolean;
}
