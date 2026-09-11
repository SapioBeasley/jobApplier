export interface EligibilityInput {
  lifecycleStatus: string;
  remoteUsEligible: boolean;
  remoteType: string;
  quickApply: string;
  applicationType: string;
  preferredApplyUrl: string | null;
  userStatus?: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

const SUPPORTED_TYPES = new Set(["quick_apply", "easy_apply"]);

export function evaluateApplicationEligibility(
  input: EligibilityInput,
): EligibilityResult {
  const reasons: string[] = [];

  if (input.lifecycleStatus !== "active") reasons.push("job_not_active");
  if (!input.remoteUsEligible) reasons.push("not_remote_us_eligible");
  if (input.remoteType === "onsite" || input.remoteType === "hybrid") {
    reasons.push("not_remote");
  }
  if (input.quickApply !== "yes") reasons.push("not_confirmed_quick_apply");
  if (!SUPPORTED_TYPES.has(input.applicationType)) {
    reasons.push("unsupported_application_type");
  }
  if (!input.preferredApplyUrl) reasons.push("missing_application_url");
  if (input.userStatus === "applied") reasons.push("already_applied");
  if (input.userStatus === "skipped") reasons.push("explicitly_skipped");

  return { eligible: reasons.length === 0, reasons };
}
