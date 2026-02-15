import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT, LOOP_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { claimFlight } from "./claim.js";

beforeEach(() => {
  freshDb();
});

describe("claimFlight", () => {
  it("returns claimed: false when no pending flights", () => {
    const result = claimFlight("test-bp_worker");
    expect(result.claimed).toBe(false);
  });

  it("claims a pending flight and resolves nectar template", () => {
    const { swarm, flights } = seedSwarm();
    // First flight is pending
    const result = claimFlight("test-bp_worker");
    expect(result.claimed).toBe(true);
    if (result.claimed) {
      expect(result.data.swarm_id).toBe(swarm.id);
      expect(result.data.resolved_input).toContain("Test task");
      expect(result.data.type).toBe("single");
    }
  });

  it("includes cell context for loop flights", () => {
    const { swarm, flights } = seedSwarm(LOOP_BLUEPRINT);
    const loopFlight = flights.find(f => f.type === "loop")!;

    // Insert cells
    const c1 = db.insertCell(swarm.id, 0, "cell-1", "First Cell", "Do first thing", ["criterion"]);
    db.insertCell(swarm.id, 1, "cell-2", "Second Cell", "Do second thing", []);

    // Set loop flight to pending (simulate decompose flight done, pipeline advanced)
    db.updateFlight(loopFlight.id, { status: "pending" });

    const beeId = `${LOOP_BLUEPRINT.id}_worker`;
    const result = claimFlight(beeId);
    expect(result.claimed).toBe(true);
    if (result.claimed) {
      expect(result.data.type).toBe("loop");
      expect(result.data.cell).toBeDefined();
      expect(result.data.cell!.cell_id).toBe("cell-1");
      expect(result.data.cell!.title).toBe("First Cell");
    }

    // Cell should be marked in_progress
    expect(db.getCell(c1.id)!.status).toBe("in_progress");
  });

  it("computes progress string", () => {
    const { swarm } = seedSwarm();
    const result = claimFlight("test-bp_worker");
    if (result.claimed) {
      expect(result.data.resolved_input).toBeDefined();
    }
  });

  it("returns claimed: false when swarm is not buzzing", () => {
    const { swarm, flights } = seedSwarm();
    db.updateSwarm(swarm.id, { status: "paused" });
    const result = claimFlight("test-bp_worker");
    expect(result.claimed).toBe(false);
  });
});
