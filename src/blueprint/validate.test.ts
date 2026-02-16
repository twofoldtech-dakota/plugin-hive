import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT, TRIGGER_BLUEPRINT, DAG_BLUEPRINT } from "../test/helpers.js";
import { validateBlueprint } from "./validate.js";
import type { BlueprintSpec } from "../types.js";

beforeEach(() => {
  freshDb();
});

describe("validateBlueprint", () => {
  it("returns valid with no issues for a valid installed blueprint", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);
    const result = validateBlueprint("test-bp");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    }
  });

  it("returns valid for TRIGGER_BLUEPRINT with triggers", () => {
    seedBlueprint(TRIGGER_BLUEPRINT);
    const result = validateBlueprint("test-trigger");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.valid).toBe(true);
      // Trigger blueprint has valid triggers with blueprint field, so no errors
      expect(result.issues.filter(i => i.type === "error")).toHaveLength(0);
    }
  });

  it("returns success:false for non-existent blueprint", () => {
    const result = validateBlueprint("nonexistent-bp");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("returns valid with warnings for unreachable nectar refs", () => {
    const bp: BlueprintSpec = {
      id: "unreachable-nectar",
      name: "Unreachable Nectar BP",
      version: 1,
      bees: [
        { id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } },
      ],
      flights: [
        {
          id: "do-work",
          bee: "worker",
          type: "single",
          input: "Implement {{task}} with {{unknown_var}}",
          expects: "STATUS: done",
          max_retries: 2,
        },
      ],
    };
    seedBlueprint(bp);
    const result = validateBlueprint("unreachable-nectar");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.valid).toBe(true);
      const warnings = result.issues.filter(i => i.type === "warning");
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.some(w => w.message.includes("unknown_var"))).toBe(true);
    }
  });

  it("returns valid:true for MINIMAL_BLUEPRINT", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);
    const result = validateBlueprint("test-bp");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.valid).toBe(true);
    }
  });

  it("returns valid:true for DAG_BLUEPRINT", () => {
    seedBlueprint(DAG_BLUEPRINT);
    const result = validateBlueprint("test-dag");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.valid).toBe(true);
    }
  });

  it("warns when analysis bee is assigned to a loop flight", () => {
    const bp: BlueprintSpec = {
      id: "role-mismatch",
      name: "Role Mismatch BP",
      version: 1,
      bees: [
        { id: "queen", role: "analysis", chamber: { base_dir: "q", files: {} } },
        { id: "inspector", role: "verification", chamber: { base_dir: "i", files: {} } },
      ],
      flights: [
        {
          id: "loop-analysis",
          bee: "queen",
          type: "loop",
          loop: { over: "cells", verify_each: true, verify_flight: "verify", completion: "all_done" },
          input: "Analyze: {{current_cell}}",
          expects: "STATUS: done",
          max_retries: 2,
        },
        {
          id: "verify",
          bee: "inspector",
          type: "single",
          input: "Verify: {{current_cell}}",
          expects: "STATUS: pass/retry",
          max_retries: 2,
        },
      ],
    };
    seedBlueprint(bp);
    const result = validateBlueprint("role-mismatch");
    expect(result.success).toBe(true);
    if (result.success) {
      const warnings = result.issues.filter(i => i.type === "warning");
      expect(warnings.some(w => w.message.includes("analysis bee"))).toBe(true);
    }
  });

  it("returns error issue for trigger missing blueprint field", () => {
    const bp: BlueprintSpec = {
      id: "bad-trigger",
      name: "Bad Trigger BP",
      version: 1,
      bees: [
        { id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } },
      ],
      flights: [
        {
          id: "do-work",
          bee: "worker",
          type: "single",
          input: "Implement: {{task}}",
          expects: "STATUS: done",
          max_retries: 2,
        },
      ],
      triggers: [
        {
          on: "swarm.completed",
          blueprint: "",
          task_template: "Follow-up",
        },
      ],
    };
    seedBlueprint(bp);
    const result = validateBlueprint("bad-trigger");
    expect(result.success).toBe(true);
    if (result.success) {
      // empty blueprint string is falsy, so the trigger validation should flag it
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === "error" && i.message.includes("Trigger"))).toBe(true);
    }
  });
});
