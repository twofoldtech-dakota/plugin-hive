import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedSwarm, seedBlueprint, MINIMAL_BLUEPRINT, TRIGGER_BLUEPRINT } from "../test/helpers.js";
import { checkAndFireTriggers } from "./trigger.js";

beforeEach(() => {
  freshDb();
});

describe("checkAndFireTriggers", () => {
  it("does nothing when blueprint has no triggers", () => {
    const { swarm } = seedSwarm(MINIMAL_BLUEPRINT, "Simple task");
    db.updateSwarm(swarm.id, { status: "completed" });

    checkAndFireTriggers(swarm.id, "swarm.completed");

    // Only the original swarm should exist — no child swarm created
    const allSwarms = db.listSwarms();
    expect(allSwarms).toHaveLength(1);
    expect(allSwarms[0].id).toBe(swarm.id);
  });

  it("fires trigger on swarm.completed and creates child swarm", () => {
    // Install both blueprints: the trigger blueprint and its target (test-bp)
    seedBlueprint(TRIGGER_BLUEPRINT);
    seedBlueprint(MINIMAL_BLUEPRINT);

    // Create parent swarm from the trigger blueprint
    const { swarm } = seedSwarm(TRIGGER_BLUEPRINT, "Build feature");
    db.updateSwarm(swarm.id, { status: "completed" });
    db.updateSwarm(swarm.id, { nectar: JSON.stringify({ task: "Build feature" }) });

    checkAndFireTriggers(swarm.id, "swarm.completed");

    // A child swarm should have been created from the target blueprint "test-bp"
    const allSwarms = db.listSwarms();
    expect(allSwarms.length).toBeGreaterThanOrEqual(2);

    const childSwarm = allSwarms.find(
      (s) => s.id !== swarm.id && s.blueprint_id === "test-bp",
    );
    expect(childSwarm).toBeDefined();
    expect(childSwarm!.task).toBe("Follow-up for Build feature");
    expect(childSwarm!.parent_swarm_id).toBe(swarm.id);
    expect(childSwarm!.chain_id).toBeDefined();
  });

  it("does NOT fire trigger on swarm.failed when trigger is for swarm.completed", () => {
    seedBlueprint(TRIGGER_BLUEPRINT);
    seedBlueprint(MINIMAL_BLUEPRINT);

    const { swarm } = seedSwarm(TRIGGER_BLUEPRINT, "Build feature");
    db.updateSwarm(swarm.id, { status: "failed" });

    checkAndFireTriggers(swarm.id, "swarm.failed");

    // No child swarm should be created because the trigger listens for swarm.completed only
    const allSwarms = db.listSwarms();
    expect(allSwarms).toHaveLength(1);
    expect(allSwarms[0].id).toBe(swarm.id);
  });

  it("does NOT fire trigger when condition evaluates to false", () => {
    // Create a blueprint with a conditional trigger that requires status == "special"
    const conditionalBp = {
      ...TRIGGER_BLUEPRINT,
      id: "test-conditional",
      triggers: [
        {
          on: "swarm.completed" as const,
          blueprint: "test-bp",
          nectar_forward: ["status"],
          task_template: "Follow-up for {{task}}",
          condition: "{{status}} == special",
        },
      ],
    };

    seedBlueprint(conditionalBp);
    seedBlueprint(MINIMAL_BLUEPRINT);

    const { swarm } = seedSwarm(conditionalBp, "Build feature");
    db.updateSwarm(swarm.id, { status: "completed" });
    // The trigger code sets nectar.status to "pass" for completed events,
    // which does NOT equal "special", so the condition should fail.

    checkAndFireTriggers(swarm.id, "swarm.completed");

    // No child swarm should be created because the condition is not met
    const allSwarms = db.listSwarms();
    expect(allSwarms).toHaveLength(1);
    expect(allSwarms[0].id).toBe(swarm.id);
  });

  it("creates a chain when parent swarm has no chain_id", () => {
    seedBlueprint(TRIGGER_BLUEPRINT);
    seedBlueprint(MINIMAL_BLUEPRINT);

    const { swarm } = seedSwarm(TRIGGER_BLUEPRINT, "Build feature");
    db.updateSwarm(swarm.id, { status: "completed" });

    // Parent swarm has no chain_id initially
    const parentBefore = db.getSwarm(swarm.id)!;
    expect(parentBefore.chain_id).toBeNull();

    checkAndFireTriggers(swarm.id, "swarm.completed");

    // A chain should have been created with the parent swarm as root
    const chain = db.getChainByRootSwarm(swarm.id);
    expect(chain).toBeDefined();
    expect(chain!.root_swarm_id).toBe(swarm.id);

    // The child swarm should belong to that chain
    const allSwarms = db.listSwarms();
    const childSwarm = allSwarms.find(
      (s) => s.id !== swarm.id && s.blueprint_id === "test-bp",
    );
    expect(childSwarm).toBeDefined();
    expect(childSwarm!.chain_id).toBe(chain!.id);
  });

  it("does nothing for a non-existent swarm", () => {
    // Should not throw, just return silently
    checkAndFireTriggers("nonexistent-id", "swarm.completed");
    const allSwarms = db.listSwarms();
    expect(allSwarms).toHaveLength(0);
  });

  it("does not fire when target blueprint is not installed", () => {
    // Install trigger blueprint but NOT the target "test-bp"
    seedBlueprint(TRIGGER_BLUEPRINT);

    const swarm = db.createSwarm("test-trigger", "Build feature", { task: "Build feature" });
    db.updateSwarm(swarm.id, { status: "completed" });

    checkAndFireTriggers(swarm.id, "swarm.completed");

    // No child swarm should be created
    const allSwarms = db.listSwarms();
    expect(allSwarms).toHaveLength(1);
  });
});
