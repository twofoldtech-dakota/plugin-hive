import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm } from "../test/helpers.js";
import * as db from "../db.js";
import { getSwarmAnalytics } from "./analytics.js";

beforeEach(() => {
  freshDb();
});

describe("getSwarmAnalytics", () => {
  it("returns error for non-existent swarm", () => {
    const result = getSwarmAnalytics("nonexistent");
    expect(result.success).toBe(false);
  });

  it("returns analytics for a swarm", () => {
    const { swarm } = seedSwarm();
    const result = getSwarmAnalytics(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.swarm_id).toBe(swarm.id);
      expect(result.data.status).toBe("buzzing");
      expect(result.data.flights.total).toBeGreaterThanOrEqual(1);
      expect(result.data.parallelism_ratio).toBeGreaterThanOrEqual(0);
    }
  });

  it("identifies bottleneck from completed flights", () => {
    const { swarm, flights } = seedSwarm();
    // Complete the flight with timestamps
    db.updateFlight(flights[0].id, {
      status: "done",
      started_at: "2025-01-01 00:00:00",
      completed_at: "2025-01-01 00:05:00",
    });

    const result = getSwarmAnalytics(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flights.bottleneck).not.toBeNull();
    }
  });
});
