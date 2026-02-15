import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT, LOOP_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { getSwarmStatus } from "./status.js";

beforeEach(() => {
  freshDb();
});

describe("getSwarmStatus", () => {
  it("returns error for nonexistent swarm", () => {
    const result = getSwarmStatus("nonexistent");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No swarm found");
    }
  });

  it("finds swarm by number", () => {
    const { swarm } = seedSwarm();
    const result = getSwarmStatus(String(swarm.swarm_number));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.swarm.id).toBe(swarm.id);
    }
  });

  it("includes flight details", () => {
    const { swarm, flights } = seedSwarm();
    const result = getSwarmStatus(String(swarm.swarm_number));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flights).toHaveLength(flights.length);
      expect(result.data.flights[0].status).toBe("pending");
    }
  });

  it("includes cells when present", () => {
    const { swarm } = seedSwarm();
    db.insertCell(swarm.id, 0, "cell-1", "First", "Desc", []);
    db.insertCell(swarm.id, 1, "cell-2", "Second", "Desc", []);

    const result = getSwarmStatus(String(swarm.swarm_number));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cells).toHaveLength(2);
      expect(result.data.cells![0].id).toBe("cell-1");
    }
  });

  it("omits cells when none exist", () => {
    seedSwarm();
    const result = getSwarmStatus("1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cells).toBeUndefined();
    }
  });

  it("includes swarm metadata", () => {
    const { swarm } = seedSwarm();
    const result = getSwarmStatus(String(swarm.swarm_number));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.swarm.blueprint).toBe("test-bp");
      expect(result.data.swarm.task).toBe("Test task");
      expect(result.data.swarm.status).toBe("buzzing");
      expect(result.data.swarm.created_at).toBeDefined();
    }
  });
});
