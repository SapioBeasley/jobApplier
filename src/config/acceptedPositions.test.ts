import { describe, expect, it } from "vitest";
import { acceptedPositions } from "./acceptedPositions";

const expectedExpandedPositions = [
  "project manager",
  "senior project manager",
  "program manager",
  "senior program manager",
  "project coordinator",
  "program coordinator",
  "project management specialist",
  "technical project manager",
  "implementation project manager",
  "implementation manager",
  "operations project manager",
  "operations program manager",
  "business project manager",
  "strategic project manager",
  "pmo project manager",
  "pmo manager",
  "project delivery manager",
  "delivery manager",
  "client project manager",
  "portfolio manager",
  "portfolio project manager",
  "transformation project manager",
  "change management project manager",
  "process improvement manager",
  "continuous improvement manager",
  "agile project manager",
  "project lead",
  "program lead",
] as const;

describe("acceptedPositions", () => {
  it("contains the expanded explicit project/program management allowlist", () => {
    expect(acceptedPositions).toEqual(expectedExpandedPositions);
  });
});
