import { describe, expect, it } from "vitest";
import { evaluateApplicationEligibility } from "../src/applications/eligibility";

const eligible = {
  lifecycleStatus: "active",
  remoteUsEligible: true,
  remoteType: "remote",
  quickApply: "yes",
  applicationType: "easy_apply",
  preferredApplyUrl: "https://example.com/apply",
  userStatus: null,
};

describe("application eligibility", () => {
  it("accepts a supported active remote-US quick/easy apply job", () => {
    expect(evaluateApplicationEligibility(eligible)).toEqual({
      eligible: true,
      reasons: [],
    });
  });

  it("rejects a job that has already been applied to", () => {
    const result = evaluateApplicationEligibility({
      ...eligible,
      userStatus: "applied",
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("already_applied");
  });

  it("rejects jobs without confirmed quick/easy apply", () => {
    const result = evaluateApplicationEligibility({
      ...eligible,
      quickApply: "unknown",
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("not_confirmed_quick_apply");
  });

  it("rejects hybrid work even when US eligible", () => {
    const result = evaluateApplicationEligibility({
      ...eligible,
      remoteType: "hybrid",
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("not_remote");
  });

  it("rejects an unknown work arrangement because remote must be confirmed", () => {
    const result = evaluateApplicationEligibility({
      ...eligible,
      remoteType: "unknown",
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("not_remote");
  });

  it("returns all applicable rejection reasons", () => {
    const result = evaluateApplicationEligibility({
      ...eligible,
      lifecycleStatus: "closed",
      remoteUsEligible: false,
      quickApply: "no",
      preferredApplyUrl: null,
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "job_not_active",
        "not_remote_us_eligible",
        "not_confirmed_quick_apply",
        "missing_application_url",
      ]),
    );
  });
});
