import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { resolveInheritance } from "./inherit.js";
import type { BlueprintSpec } from "../types.js";

beforeEach(() => {
  process.env.HIVE_DATA_DIR = "/tmp/hive-test-inherit";
  freshDb();
});

const PARENT_BP: BlueprintSpec = {
  id: "parent-bp",
  name: "Parent Blueprint",
  version: 1,
  bees: [
    { id: "worker", role: "coding", chamber: { base_dir: "worker", files: {} } },
    { id: "inspector", role: "verification", chamber: { base_dir: "inspector", files: {} } },
  ],
  flights: [
    { id: "implement", bee: "worker", type: "single", input: "Do {{task}}", expects: "STATUS: done", max_retries: 2 },
    { id: "verify", bee: "inspector", type: "single", input: "Check {{task}}", expects: "STATUS: pass", max_retries: 1 },
  ],
};

describe("resolveInheritance", () => {
  it("returns spec as-is when no extends", () => {
    const result = resolveInheritance(MINIMAL_BLUEPRINT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.spec.id).toBe(MINIMAL_BLUEPRINT.id);
      expect(result.chain).toEqual([MINIMAL_BLUEPRINT.id]);
    }
  });

  it("merges child overrides into parent", () => {
    seedBlueprint(PARENT_BP);

    const child: BlueprintSpec = {
      id: "child-bp",
      name: "Child Blueprint",
      version: 2,
      extends: "parent-bp",
      bees: [
        { id: "worker", role: "coding", model: "opus", chamber: { base_dir: "worker", files: {} } },
      ],
      flights: [
        { id: "implement", bee: "worker", type: "single", input: "Custom: {{task}}", expects: "STATUS: done", max_retries: 5 },
      ],
    };

    const result = resolveInheritance(child);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.chain).toEqual(["parent-bp", "child-bp"]);
      // Worker should have opus model from child
      const worker = result.spec.bees.find(b => b.id === "worker");
      expect(worker?.model).toBe("opus");
      // Inspector should be inherited from parent
      const inspector = result.spec.bees.find(b => b.id === "inspector");
      expect(inspector).toBeDefined();
      // Implement flight should use child's input
      const impl = result.spec.flights.find(f => f.id === "implement");
      expect(impl?.input).toBe("Custom: {{task}}");
      expect(impl?.max_retries).toBe(5);
      // Verify flight should be inherited
      const verify = result.spec.flights.find(f => f.id === "verify");
      expect(verify).toBeDefined();
      // extends should be removed from resolved spec
      expect(result.spec.extends).toBeUndefined();
    }
  });

  it("appends new bees and flights from child", () => {
    seedBlueprint(PARENT_BP);

    const child: BlueprintSpec = {
      id: "extended-bp",
      extends: "parent-bp",
      version: 1,
      bees: [
        { id: "scout", role: "analysis", chamber: { base_dir: "scout", files: {} } },
      ],
      flights: [
        { id: "research", bee: "scout", type: "single", input: "Analyze", expects: "STATUS: done", max_retries: 1 },
      ],
    };

    const result = resolveInheritance(child);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.spec.bees).toHaveLength(3); // 2 parent + 1 new
      expect(result.spec.flights).toHaveLength(3); // 2 parent + 1 new
    }
  });

  it("detects circular inheritance", () => {
    // Install parent that extends child (cycle)
    const bp1: BlueprintSpec = {
      id: "cycle-a",
      version: 1,
      extends: "cycle-b",
      bees: [{ id: "w", role: "coding", chamber: { base_dir: "w", files: {} } }],
      flights: [{ id: "f", bee: "w", type: "single", input: "x", expects: "x", max_retries: 1 }],
    };
    const bp2: BlueprintSpec = {
      id: "cycle-b",
      version: 1,
      extends: "cycle-a",
      bees: [{ id: "w", role: "coding", chamber: { base_dir: "w", files: {} } }],
      flights: [{ id: "f", bee: "w", type: "single", input: "x", expects: "x", max_retries: 1 }],
    };
    seedBlueprint(bp1);
    seedBlueprint(bp2);

    const result = resolveInheritance(bp1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Circular");
    }
  });

  it("enforces max depth limit", () => {
    // Create a chain of 6 blueprints (exceeds MAX_DEPTH=5)
    for (let i = 0; i < 6; i++) {
      const bp: BlueprintSpec = {
        id: `depth-${i}`,
        version: 1,
        extends: i > 0 ? `depth-${i - 1}` : undefined,
        bees: [{ id: "w", role: "coding", chamber: { base_dir: "w", files: {} } }],
        flights: [{ id: "f", bee: "w", type: "single", input: "x", expects: "x", max_retries: 1 }],
      };
      seedBlueprint(bp);
    }

    const child: BlueprintSpec = {
      id: "too-deep",
      version: 1,
      extends: "depth-5",
      bees: [],
      flights: [],
    };

    const result = resolveInheritance(child);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("depth exceeds");
    }
  });

  it("returns error for missing parent", () => {
    const child: BlueprintSpec = {
      id: "orphan",
      version: 1,
      extends: "nonexistent",
      bees: [],
      flights: [],
    };

    const result = resolveInheritance(child);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not installed");
    }
  });

  it("replaces top-level config sections from child", () => {
    const parent: BlueprintSpec = {
      ...PARENT_BP,
      polling: { model: "haiku", timeout_seconds: 120 },
      beekeeper: { stuck_flight_minutes: 30 },
    };
    seedBlueprint(parent);

    const child: BlueprintSpec = {
      id: "config-child",
      version: 1,
      extends: "parent-bp",
      bees: [],
      flights: [],
      polling: { model: "sonnet" },
    };

    const result = resolveInheritance(child);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.spec.polling?.model).toBe("sonnet");
      // beekeeper inherited from parent
      expect(result.spec.beekeeper?.stuck_flight_minutes).toBe(30);
    }
  });

  it("handles gate: null removal in flight merge", () => {
    const parent: BlueprintSpec = {
      ...PARENT_BP,
      flights: [
        ...PARENT_BP.flights,
        { id: "gated", bee: "worker", type: "single", input: "Do", expects: "STATUS: done", max_retries: 1, gate: "approval" as any },
      ],
    };
    seedBlueprint(parent);

    const child: BlueprintSpec = {
      id: "no-gate-child",
      version: 1,
      extends: "parent-bp",
      bees: [],
      flights: [
        { id: "gated", bee: "worker", type: "single", input: "Do", expects: "STATUS: done", max_retries: 1, gate: null as any },
      ],
    };

    const result = resolveInheritance(child);
    expect(result.success).toBe(true);
    if (result.success) {
      const gated = result.spec.flights.find(f => f.id === "gated");
      expect(gated).toBeDefined();
      expect((gated as any).gate).toBeUndefined();
    }
  });
});
