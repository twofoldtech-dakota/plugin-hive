import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm } from "../test/helpers.js";
import * as db from "../db.js";
import { getSwarmUsage } from "./aggregate.js";

beforeEach(() => {
  process.env.HIVE_DATA_DIR = "/tmp/hive-test-aggregate";
  freshDb();
});

describe("getSwarmUsage", () => {
  it("returns error for non-existent swarm", () => {
    const result = getSwarmUsage("not-found");
    expect(result.success).toBe(false);
  });

  it("returns empty totals for swarm with no usage", () => {
    const { swarm } = seedSwarm();
    const result = getSwarmUsage(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totals.total_tokens).toBe(0);
      expect(result.data.by_flight).toHaveLength(0);
    }
  });

  it("aggregates usage by bee and flight", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];

    db.insertUsage(flight.id, swarm.id, "test-bp_worker", 100, 50, false);

    const result = getSwarmUsage(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totals.total_tokens).toBe(150);
      expect(result.data.totals.input_tokens).toBe(100);
      expect(result.data.totals.output_tokens).toBe(50);
      expect(result.data.totals.actual_count).toBe(1);
      expect(result.data.totals.estimated_count).toBe(0);
      expect(result.data.by_bee["test-bp_worker"]).toBeDefined();
      expect(result.data.by_bee["test-bp_worker"].flights).toBe(1);
      expect(result.data.by_flight).toHaveLength(1);
    }
  });

  it("separates estimated vs actual counts", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];

    db.insertUsage(flight.id, swarm.id, "test-bp_worker", 100, 50, false);
    db.insertUsage("other-flight", swarm.id, "test-bp_worker", 200, 100, true);

    const result = getSwarmUsage(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totals.actual_count).toBe(1);
      expect(result.data.totals.estimated_count).toBe(1);
      expect(result.data.totals.total_tokens).toBe(450);
    }
  });
});
