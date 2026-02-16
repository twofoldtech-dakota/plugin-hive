import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { getChainStatus, listChains } from "./status.js";

beforeEach(() => {
  freshDb();
});

describe("getChainStatus", () => {
  it("returns error for non-existent chain", () => {
    const result = getChainStatus("nonexistent-chain-id");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("returns chain info with swarms", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);

    // Create a root swarm
    const rootSwarm = db.createSwarm("test-bp", "Root task", { task: "Root task" });

    // Create a chain with that root swarm
    const chain = db.insertChain(rootSwarm.id, "Test chain");

    // Create a child swarm belonging to the chain
    const childSwarm = db.createSwarm(
      "test-bp",
      "Child task",
      { task: "Child task" },
      undefined,
      { chain_id: chain.id, parent_swarm_id: rootSwarm.id },
    );

    const result = getChainStatus(chain.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.chain.id).toBe(chain.id);
    expect(result.data.chain.root_swarm_id).toBe(rootSwarm.id);
    expect(result.data.chain.name).toBe("Test chain");

    // Only the child swarm has chain_id set, so getSwarmsForChain returns it
    expect(result.data.swarms.length).toBeGreaterThanOrEqual(1);
    const childInChain = result.data.swarms.find((s) => s.id === childSwarm.id);
    expect(childInChain).toBeDefined();
    expect(childInChain!.blueprint_id).toBe("test-bp");
    expect(childInChain!.task).toBe("Child task");
    expect(childInChain!.parent_swarm_id).toBe(rootSwarm.id);
  });

  it("returns empty swarms array when chain has no linked swarms", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);

    const rootSwarm = db.createSwarm("test-bp", "Root task", { task: "Root task" });
    const chain = db.insertChain(rootSwarm.id);

    // Chain exists but no swarms have chain_id set
    const result = getChainStatus(chain.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.chain.id).toBe(chain.id);
    expect(result.data.swarms).toHaveLength(0);
  });

  it("returns correct swarm fields in response", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);

    const rootSwarm = db.createSwarm("test-bp", "Root task", { task: "Root task" });
    const chain = db.insertChain(rootSwarm.id);

    db.createSwarm(
      "test-bp",
      "Child task",
      { task: "Child task" },
      undefined,
      { chain_id: chain.id, parent_swarm_id: rootSwarm.id },
    );

    const result = getChainStatus(chain.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const swarm = result.data.swarms[0];
    expect(swarm).toHaveProperty("id");
    expect(swarm).toHaveProperty("swarm_number");
    expect(swarm).toHaveProperty("blueprint_id");
    expect(swarm).toHaveProperty("task");
    expect(swarm).toHaveProperty("status");
    expect(swarm).toHaveProperty("parent_swarm_id");
    expect(swarm).toHaveProperty("created_at");
  });
});

describe("listChains", () => {
  it("returns empty array when no chains exist", () => {
    const result = listChains();
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.chains).toHaveLength(0);
  });

  it("returns all chains", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);

    const swarm1 = db.createSwarm("test-bp", "Task 1", { task: "Task 1" });
    const swarm2 = db.createSwarm("test-bp", "Task 2", { task: "Task 2" });

    db.insertChain(swarm1.id, "Chain 1");
    db.insertChain(swarm2.id, "Chain 2");

    const result = listChains();
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.chains).toHaveLength(2);
  });

  it("filters chains by status", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);

    const swarm1 = db.createSwarm("test-bp", "Task 1", { task: "Task 1" });
    const swarm2 = db.createSwarm("test-bp", "Task 2", { task: "Task 2" });

    const chain1 = db.insertChain(swarm1.id, "Active chain");
    const chain2 = db.insertChain(swarm2.id, "Completed chain");
    db.updateChain(chain2.id, { status: "completed" });

    // Filter for active only
    const activeResult = listChains("active");
    expect(activeResult.success).toBe(true);
    if (!activeResult.success) return;
    expect(activeResult.chains).toHaveLength(1);
    expect(activeResult.chains[0].id).toBe(chain1.id);

    // Filter for completed only
    const completedResult = listChains("completed");
    expect(completedResult.success).toBe(true);
    if (!completedResult.success) return;
    expect(completedResult.chains).toHaveLength(1);
    expect(completedResult.chains[0].id).toBe(chain2.id);
  });

  it("returns empty array when no chains match the status filter", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);

    const swarm = db.createSwarm("test-bp", "Task", { task: "Task" });
    db.insertChain(swarm.id, "Active chain");

    const result = listChains("completed");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.chains).toHaveLength(0);
  });
});
