import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "../test/helpers.js";
import * as db from "../db.js";
import { updateBeeStats, getBeeStatsQuery } from "./bee-stats.js";

beforeEach(() => {
  process.env.HIVE_DATA_DIR = "/tmp/hive-test-bee-stats";
  freshDb();
});

describe("updateBeeStats", () => {
  it("creates stats on first call", () => {
    const result = updateBeeStats("test-bp_worker", true, 10, 500);
    expect(result.bee_id).toBe("test-bp_worker");
    expect(result.total_flights).toBe(1);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.success_rate).toBe(1);
    expect(result.total_tokens).toBe(500);
  });

  it("accumulates stats across calls", () => {
    updateBeeStats("test-bp_worker", true, 10, 100);
    updateBeeStats("test-bp_worker", true, 20, 200);
    updateBeeStats("test-bp_worker", false, 5, 50);

    const stats = db.getBeeStats("test-bp_worker");
    expect(stats).toBeDefined();
    expect(stats!.total_flights).toBe(3);
    expect(stats!.successes).toBe(2);
    expect(stats!.failures).toBe(1);
    expect(stats!.total_tokens).toBe(350);
    // success_rate ≈ 0.67
    expect(stats!.success_rate).toBeCloseTo(0.67, 1);
  });

  it("computes rolling average duration", () => {
    updateBeeStats("test-bp_worker", true, 10, 0);
    updateBeeStats("test-bp_worker", true, 30, 0);

    const stats = db.getBeeStats("test-bp_worker");
    expect(stats).toBeDefined();
    // (10 + 30) / 2 = 20
    expect(stats!.avg_duration_seconds).toBe(20);
  });
});

describe("getBeeStatsQuery", () => {
  it("returns stats for a specific bee", () => {
    updateBeeStats("test-bp_worker", true, 10, 0);

    const result = getBeeStatsQuery("test-bp_worker");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stats).toHaveLength(1);
      expect(result.stats[0].bee_id).toBe("test-bp_worker");
    }
  });

  it("returns empty array for unknown bee", () => {
    const result = getBeeStatsQuery("nonexistent");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stats).toHaveLength(0);
    }
  });

  it("returns all bees when no filter", () => {
    updateBeeStats("bp_worker", true, 10, 0);
    updateBeeStats("bp_inspector", true, 5, 0);

    const result = getBeeStatsQuery();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stats.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("filters by blueprint prefix", () => {
    updateBeeStats("feature-dev_worker", true, 10, 0);
    updateBeeStats("feature-dev_inspector", true, 5, 0);
    updateBeeStats("bug-fix_worker", true, 8, 0);

    const result = getBeeStatsQuery(undefined, "feature-dev");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stats).toHaveLength(2);
      expect(result.stats.every(s => s.bee_id.startsWith("feature-dev_"))).toBe(true);
    }
  });
});
