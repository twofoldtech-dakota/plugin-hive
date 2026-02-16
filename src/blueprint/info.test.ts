import { describe, it, expect } from "vitest";
import { validateInputs } from "./info.js";
import type { BlueprintSpec } from "../types.js";

function makeSpec(inputs?: BlueprintSpec["inputs"]): BlueprintSpec {
  return {
    id: "test",
    bees: [],
    flights: [],
    inputs,
  } as any;
}

describe("validateInputs", () => {
  it("returns valid with no inputs defined", () => {
    const result = validateInputs(makeSpec(), {});
    expect(result.valid).toBe(true);
  });

  it("returns valid when all required inputs are provided", () => {
    const result = validateInputs(
      makeSpec([{ name: "task", required: true }]),
      { task: "do something" },
    );
    expect(result.valid).toBe(true);
    expect((result as any).merged.task).toBe("do something");
  });

  it("returns error when required input is missing", () => {
    const result = validateInputs(
      makeSpec([{ name: "task", required: true }]),
      {},
    );
    expect(result.valid).toBe(false);
    expect((result as any).error).toContain("task");
  });

  it("applies default values for missing optional inputs", () => {
    const result = validateInputs(
      makeSpec([{ name: "verbosity", default: "normal" }]),
      {},
    );
    expect(result.valid).toBe(true);
    expect((result as any).merged.verbosity).toBe("normal");
  });

  it("does not override provided values with defaults", () => {
    const result = validateInputs(
      makeSpec([{ name: "verbosity", default: "normal" }]),
      { verbosity: "verbose" },
    );
    expect(result.valid).toBe(true);
    expect((result as any).merged.verbosity).toBe("verbose");
  });

  it("handles mix of required and optional inputs", () => {
    const result = validateInputs(
      makeSpec([
        { name: "task", required: true },
        { name: "branch", default: "main" },
      ]),
      { task: "build feature" },
    );
    expect(result.valid).toBe(true);
    expect((result as any).merged.task).toBe("build feature");
    expect((result as any).merged.branch).toBe("main");
  });
});
