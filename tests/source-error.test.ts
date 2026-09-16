import { describe, expect, it } from "vitest";
import { formatSourceFailure } from "../src/aggregation/sourceError";

describe("formatSourceFailure", () => {
  it("includes the source and error text", () => {
    expect(formatSourceFailure("builtin", new Error("boom"))).toContain("[builtin]");
    expect(formatSourceFailure("builtin", new Error("boom"))).toContain("boom");
  });
});
