import { describe, expect, it } from "vitest";
import { matchesAnyAcceptedPosition } from "../src/jobs/acceptedPosition";

describe("accepted position matching", () => {
  it("matches a configured position phrase inside a more specific title", () => {
    expect(
      matchesAnyAcceptedPosition("Senior Product Manager, AI", [
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

  it("does not treat an empty allowlist as accept-all", () => {
    expect(matchesAnyAcceptedPosition("Product Manager", [])).toBe(false);
  });
});
