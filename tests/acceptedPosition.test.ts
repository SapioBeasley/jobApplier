import { describe, expect, it } from "vitest";
import { acceptedPositions } from "../src/config/acceptedPositions";
import { matchesAnyAcceptedPosition } from "../src/jobs/acceptedPosition";

describe("accepted position matching", () => {
  it("matches an exact configured position", () => {
    expect(
      matchesAnyAcceptedPosition("Product Manager", ["product manager"]),
    ).toBe(true);
  });

  it("matches a configured position phrase inside a more specific title", () => {
    expect(
      matchesAnyAcceptedPosition("Senior Product Manager, AI", [
        "product manager",
      ]),
    ).toBe(true);
  });

  it("matches across punctuation after normalization", () => {
    expect(
      matchesAnyAcceptedPosition("Senior Product-Manager (AI)", [
        "product manager",
      ]),
    ).toBe(true);
  });

  it("does not match unrelated titles that only share individual words", () => {
    expect(
      matchesAnyAcceptedPosition("Product Marketing Manager", [
        "product manager",
      ]),
    ).toBe(false);
  });

  it("does not let a more-specific allowlist entry accept a broader title", () => {
    expect(
      matchesAnyAcceptedPosition("Product Manager", [
        "senior product manager",
      ]),
    ).toBe(false);
  });

  it("matches whole normalized words rather than arbitrary substrings", () => {
    expect(
      matchesAnyAcceptedPosition("Product Managerial Lead", [
        "product manager",
      ]),
    ).toBe(false);
  });

  it("ignores blank configured positions", () => {
    expect(
      matchesAnyAcceptedPosition("Product Manager", ["", "   "]),
    ).toBe(false);
  });

  it("does not treat an empty allowlist as accept-all", () => {
    expect(matchesAnyAcceptedPosition("Product Manager", [])).toBe(false);
  });
});

describe("initial accepted position configuration", () => {
  it("targets the project/program delivery family", () => {
    expect(acceptedPositions).toEqual([
      "project manager",
      "program manager",
      "project coordinator",
      "project management specialist",
    ]);
  });
});
