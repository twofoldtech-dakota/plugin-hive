import * as db from "../db.js";
import type { FleetMetrics } from "../types.js";

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: 3650,
};

/**
 * Compute aggregate fleet-level metrics over a configurable time window.
 * All data sourced from SQL aggregations — no new tables required.
 */
export function getFleetMetrics(period: string = "30d"): { success: true; metrics: FleetMetrics } | { success: false; error: string } {
  const days = PERIOD_DAYS[period];
  if (!days) {
    return { success: false, error: `Invalid period "${period}". Use one of: ${Object.keys(PERIOD_DAYS).join(", ")}` };
  }

  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000).toISOString().replace("T", " ").slice(0, 19);
  const to = now.toISOString().replace("T", " ").slice(0, 19);

  // Totals by status
  const statusCounts = db.getSwarmCountsByStatus(from, to);
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const completed = statusCounts["completed"] ?? 0;
  const failed = statusCounts["failed"] ?? 0;
  const cancelled = statusCounts["cancelled"] ?? 0;
  const successRate = total > 0 ? Math.round((completed / total) * 1000) / 1000 : 0;

  // Daily trend
  const dailyTrend = db.getDailySwarmCounts(from, to);

  // Per-blueprint breakdown
  const blueprintStats = db.getPerBlueprintStats(from, to);
  const perBlueprint = blueprintStats.map(bp => ({
    blueprint_id: bp.blueprint_id,
    swarms: bp.swarms,
    completed: bp.completed,
    failed: bp.failed,
    success_rate: bp.swarms > 0 ? Math.round((bp.completed / bp.swarms) * 1000) / 1000 : 0,
    avg_duration_seconds: bp.avg_duration_seconds ? Math.round(bp.avg_duration_seconds) : null,
  }));

  // Top bees from bee_stats (lifetime — not filtered by period)
  const allBeeStats = db.getAllBeeStats();
  const topBees = allBeeStats.slice(0, 10).map(b => ({
    bee_id: b.bee_id,
    total_flights: b.total_flights,
    success_rate: b.success_rate,
    avg_duration_seconds: b.avg_duration_seconds,
  }));

  return {
    success: true,
    metrics: {
      period,
      totals: {
        swarms: total,
        completed,
        failed,
        cancelled,
        success_rate: successRate,
      },
      daily_trend: dailyTrend,
      per_blueprint: perBlueprint,
      top_bees: topBees,
    },
  };
}
