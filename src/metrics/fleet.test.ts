import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  getSwarmCountsByStatus: vi.fn(),
  getDailySwarmCounts: vi.fn(),
  getPerBlueprintStats: vi.fn(),
  getAllBeeStats: vi.fn(),
}));

import { getFleetMetrics } from "./fleet.js";
import * as db from "../db.js";

const mockDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFleetMetrics", () => {
  it("returns error for invalid period", () => {
    const result = getFleetMetrics("invalid");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid period");
    }
  });

  it("computes aggregate metrics for 30d period", () => {
    mockDb.getSwarmCountsByStatus.mockReturnValue({
      completed: 8,
      failed: 2,
      buzzing: 1,
      cancelled: 1,
    });
    mockDb.getDailySwarmCounts.mockReturnValue([
      { date: "2026-02-15", started: 3, completed: 2, failed: 1 },
      { date: "2026-02-16", started: 2, completed: 1, failed: 0 },
    ]);
    mockDb.getPerBlueprintStats.mockReturnValue([
      { blueprint_id: "feature-dev", swarms: 6, completed: 5, failed: 1, avg_duration_seconds: 120 },
      { blueprint_id: "bug-fix", swarms: 4, completed: 3, failed: 1, avg_duration_seconds: 60 },
    ]);
    mockDb.getAllBeeStats.mockReturnValue([
      { bee_id: "feature-dev_worker", total_flights: 20, success_rate: 0.9, avg_duration_seconds: 45, successes: 18, failures: 2, total_tokens: 5000, updated_at: "" },
    ]);

    const result = getFleetMetrics("30d");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metrics.period).toBe("30d");
      expect(result.metrics.totals.swarms).toBe(12);
      expect(result.metrics.totals.completed).toBe(8);
      expect(result.metrics.totals.failed).toBe(2);
      expect(result.metrics.totals.success_rate).toBeCloseTo(0.667, 2);
      expect(result.metrics.daily_trend).toHaveLength(2);
      expect(result.metrics.per_blueprint).toHaveLength(2);
      expect(result.metrics.per_blueprint[0].success_rate).toBeCloseTo(0.833, 2);
      expect(result.metrics.top_bees).toHaveLength(1);
    }
  });

  it("handles zero swarms gracefully", () => {
    mockDb.getSwarmCountsByStatus.mockReturnValue({});
    mockDb.getDailySwarmCounts.mockReturnValue([]);
    mockDb.getPerBlueprintStats.mockReturnValue([]);
    mockDb.getAllBeeStats.mockReturnValue([]);

    const result = getFleetMetrics("7d");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metrics.totals.swarms).toBe(0);
      expect(result.metrics.totals.success_rate).toBe(0);
    }
  });
});
