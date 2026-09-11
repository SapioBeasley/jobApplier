import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  makeDedupeKey,
  makeNewCanonicalJobId,
  normalizeCompany,
  normalizeText,
} from "../src/jobs/identity";

describe("job identity", () => {
  it("normalizes text deterministically", () => {
    expect(normalizeText("  Senior   Product-Manager! ")).toBe(
      "senior product manager",
    );
  });

  it("removes common company suffixes", () => {
    expect(normalizeCompany("Acme, Inc.")).toBe("acme");
    expect(normalizeCompany("Acme Corporation")).toBe("acme");
  });

  it("canonicalizes URLs by removing tracking and ordering remaining params", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/jobs/123/?utm_source=board&b=2&a=1#apply",
      ),
    ).toBe("https://example.com/jobs/123?a=1&b=2");
  });

  it("produces the same dedupe key for equivalent normalized inputs", () => {
    const a = makeDedupeKey({
      company: "Acme Inc.",
      title: "Senior Product Manager",
      location: "Remote - US",
    });
    const b = makeDedupeKey({
      company: "ACME",
      title: "Senior   Product Manager",
      location: "Remote US",
    });

    expect(a).toBe(b);
  });

  it("uses canonical apply URL as the strongest new-job identity", () => {
    const a = makeNewCanonicalJobId({
      canonicalApplyUrl: "https://ats.example/jobs/42?utm_source=a",
      source: "source-a",
      sourceJobId: "123",
      company: "Acme",
      title: "Product Manager",
    });
    const b = makeNewCanonicalJobId({
      canonicalApplyUrl: "https://ats.example/jobs/42",
      source: "source-b",
      sourceJobId: "999",
      company: "Acme Inc.",
      title: "Product Manager",
    });

    expect(a).toBe(b);
  });
});
