import { describe, it, expect } from "vitest";
import { BlueprintSpecSchema } from "./schema.js";

const minimalBlueprint = {
  id: "test-bp",
  bees: [
    { id: "worker", role: "coding", chamber: { base_dir: "worker", files: {} } },
  ],
  flights: [
    { id: "do-work", bee: "worker", input: "Do {{task}}", expects: "STATUS: done" },
  ],
};

describe("BlueprintSpecSchema", () => {
  it("accepts a minimal valid blueprint", () => {
    const result = BlueprintSpecSchema.safeParse(minimalBlueprint);
    expect(result.success).toBe(true);
  });

  it("accepts a full-featured blueprint", () => {
    const full = {
      id: "feature-dev",
      name: "Feature Development",
      version: 1,
      description: "Build features",
      polling: { model: "haiku", timeout_seconds: 120 },
      bees: [
        { id: "queen", role: "analysis", model: "opus", timeout_seconds: 900, chamber: { base_dir: "queen", files: { "IDENTITY.md": "bees/queen/IDENTITY.md" } } },
        { id: "worker", role: "coding", model: "sonnet", chamber: { base_dir: "worker", files: {} } },
      ],
      flights: [
        { id: "decompose", bee: "queen", input: "Decompose {{task}}", expects: "CELLS_JSON", max_retries: 3 },
        { id: "implement", bee: "worker", type: "loop", loop: { over: "cells", verify_each: false, completion: "all_done" }, input: "Implement {{current_cell}}", expects: "STATUS: done" },
      ],
      nectar: { project_dir: "." },
      notifications: { url: "https://hooks.example.com/hive" },
    };
    const result = BlueprintSpecSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("defaults flight type to single", () => {
    const result = BlueprintSpecSchema.safeParse(minimalBlueprint);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flights[0].type).toBe("single");
    }
  });

  it("defaults max_retries to 2", () => {
    const result = BlueprintSpecSchema.safeParse(minimalBlueprint);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flights[0].max_retries).toBe(2);
    }
  });

  it("rejects invalid blueprint ID pattern", () => {
    const bp = { ...minimalBlueprint, id: "Invalid-ID" };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects invalid bee ID pattern", () => {
    const bp = {
      ...minimalBlueprint,
      bees: [{ id: "123-bad", role: "coding", chamber: { base_dir: "x", files: {} } }],
      flights: [{ id: "f", bee: "123-bad", input: "x", expects: "x" }],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate bee IDs", () => {
    const bp = {
      ...minimalBlueprint,
      bees: [
        { id: "worker", role: "coding", chamber: { base_dir: "a", files: {} } },
        { id: "worker", role: "testing", chamber: { base_dir: "b", files: {} } },
      ],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate flight IDs", () => {
    const bp = {
      ...minimalBlueprint,
      flights: [
        { id: "do-work", bee: "worker", input: "x", expects: "x" },
        { id: "do-work", bee: "worker", input: "y", expects: "y" },
      ],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects flight referencing unknown bee", () => {
    const bp = {
      ...minimalBlueprint,
      flights: [{ id: "f1", bee: "nonexistent", input: "x", expects: "x" }],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects loop flight without loop config", () => {
    const bp = {
      ...minimalBlueprint,
      flights: [{ id: "f1", bee: "worker", type: "loop", input: "x", expects: "x" }],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects empty bees array", () => {
    const bp = { ...minimalBlueprint, bees: [] };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects empty flights array", () => {
    const bp = { ...minimalBlueprint, flights: [] };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects invalid bee role", () => {
    const bp = {
      ...minimalBlueprint,
      bees: [{ id: "worker", role: "invalid-role", chamber: { base_dir: "x", files: {} } }],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("accepts all valid bee roles", () => {
    const roles = ["analysis", "coding", "verification", "testing", "pr", "scanning"];
    for (const role of roles) {
      const bp = {
        ...minimalBlueprint,
        bees: [{ id: "bee", role, chamber: { base_dir: "x", files: {} } }],
        flights: [{ id: "f", bee: "bee", input: "x", expects: "x" }],
      };
      const result = BlueprintSpecSchema.safeParse(bp);
      expect(result.success).toBe(true);
    }
  });

  it("rejects negative timeout_seconds", () => {
    const bp = {
      ...minimalBlueprint,
      bees: [{ id: "worker", role: "coding", timeout_seconds: -1, chamber: { base_dir: "x", files: {} } }],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  // ── depends_on (DAG) validation ──────────────────────────────────

  it("accepts a blueprint with valid depends_on", () => {
    const bp = {
      ...minimalBlueprint,
      flights: [
        { id: "first", bee: "worker", input: "x", expects: "x" },
        { id: "second", bee: "worker", depends_on: ["first"], input: "x", expects: "x" },
      ],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(true);
  });

  it("rejects depends_on referencing unknown flight", () => {
    const bp = {
      ...minimalBlueprint,
      flights: [
        { id: "first", bee: "worker", input: "x", expects: "x" },
        { id: "second", bee: "worker", depends_on: ["nonexistent"], input: "x", expects: "x" },
      ],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects self-referencing depends_on", () => {
    const bp = {
      ...minimalBlueprint,
      flights: [
        { id: "first", bee: "worker", depends_on: ["first"], input: "x", expects: "x" },
      ],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("rejects cyclic depends_on", () => {
    const bp = {
      ...minimalBlueprint,
      bees: [
        { id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } },
      ],
      flights: [
        { id: "a", bee: "worker", depends_on: ["c"], input: "x", expects: "x" },
        { id: "b", bee: "worker", depends_on: ["a"], input: "x", expects: "x" },
        { id: "c", bee: "worker", depends_on: ["b"], input: "x", expects: "x" },
      ],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(false);
  });

  it("accepts DAG with parallel branches", () => {
    const bp = {
      ...minimalBlueprint,
      flights: [
        { id: "root", bee: "worker", input: "x", expects: "x" },
        { id: "branch-a", bee: "worker", depends_on: ["root"], input: "x", expects: "x" },
        { id: "branch-b", bee: "worker", depends_on: ["root"], input: "x", expects: "x" },
        { id: "merge", bee: "worker", depends_on: ["branch-a", "branch-b"], input: "x", expects: "x" },
      ],
    };
    const result = BlueprintSpecSchema.safeParse(bp);
    expect(result.success).toBe(true);
  });
});
