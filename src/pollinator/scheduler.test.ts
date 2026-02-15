import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT, LOOP_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { WaggleDanceScheduler } from "./scheduler.js";

let sched: WaggleDanceScheduler;

beforeEach(() => {
  freshDb();
  sched = new WaggleDanceScheduler();
});

describe("WaggleDanceScheduler", () => {
  it("registers a swarm and tracks bee IDs", () => {
    sched.registerSwarm("swarm-1", MINIMAL_BLUEPRINT);
    expect(sched.isRegistered("swarm-1")).toBe(true);
    expect(sched.getRegisteredSwarmIds()).toContain("swarm-1");
  });

  it("unregisters a swarm", () => {
    sched.registerSwarm("swarm-1", MINIMAL_BLUEPRINT);
    sched.unregisterSwarm("swarm-1");
    expect(sched.isRegistered("swarm-1")).toBe(false);
    expect(sched.getRegisteredSwarmIds()).not.toContain("swarm-1");
  });

  it("returns empty bees with work before refresh", () => {
    sched.registerSwarm("swarm-1", MINIMAL_BLUEPRINT);
    // Before refreshReadiness, all counts are 0
    expect(sched.getBeesWithWork()).toHaveLength(0);
  });

  it("detects bees with pending flights after refresh", () => {
    const { swarm } = seedSwarm();
    sched.registerSwarm(swarm.id, MINIMAL_BLUEPRINT);

    sched.refreshReadiness();
    const beesWithWork = sched.getBeesWithWork();
    expect(beesWithWork.length).toBeGreaterThanOrEqual(1);
    const worker = beesWithWork.find(b => b.beeId === "test-bp_worker");
    expect(worker).toBeDefined();
    expect(worker!.pendingCount).toBeGreaterThanOrEqual(1);
  });

  it("returns no bees with work when all flights are done", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "done" });

    sched.registerSwarm(swarm.id, MINIMAL_BLUEPRINT);
    sched.refreshReadiness();

    const beesWithWork = sched.getBeesWithWork();
    const worker = beesWithWork.find(b => b.beeId === "test-bp_worker");
    expect(worker).toBeUndefined();
  });

  it("retrieves blueprint spec for registered swarm", () => {
    sched.registerSwarm("swarm-1", MINIMAL_BLUEPRINT);
    const spec = sched.getBlueprintSpec("swarm-1");
    expect(spec).toBeDefined();
    expect(spec!.id).toBe("test-bp");
  });

  it("returns undefined spec for unregistered swarm", () => {
    expect(sched.getBlueprintSpec("nonexistent")).toBeUndefined();
  });

  it("handles multiple swarms independently", () => {
    const s1 = seedSwarm(MINIMAL_BLUEPRINT);

    const loopBp = { ...LOOP_BLUEPRINT, id: "loop-bp-2" };
    const s2 = seedSwarm(loopBp);

    sched.registerSwarm(s1.swarm.id, MINIMAL_BLUEPRINT);
    sched.registerSwarm(s2.swarm.id, loopBp);

    expect(sched.getRegisteredSwarmIds()).toHaveLength(2);

    sched.unregisterSwarm(s1.swarm.id);
    expect(sched.getRegisteredSwarmIds()).toHaveLength(1);
    expect(sched.isRegistered(s2.swarm.id)).toBe(true);
  });

  it("unregisterSwarm is idempotent for unknown swarm", () => {
    // Should not throw
    sched.unregisterSwarm("nonexistent");
    expect(sched.getRegisteredSwarmIds()).toHaveLength(0);
  });

  it("registers bees from loop blueprint", () => {
    sched.registerSwarm("swarm-1", LOOP_BLUEPRINT);
    // LOOP_BLUEPRINT has 3 bees: queen, worker, inspector
    // After refresh with no flights, no bees should have work
    sched.refreshReadiness();
    // But they should be registered
    expect(sched.isRegistered("swarm-1")).toBe(true);
  });
});
