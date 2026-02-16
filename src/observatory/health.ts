import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { getConfigNumber, getConfigBoolean } from "../config/global.js";
import { collectAllFactors } from "./health-factors.js";
import { safeJsonParse } from "../lib/json.js";
import type { HealthFactor, HealthScoreResult } from "../types.js";

/**
 * Compute the composite health score from all weighted factors.
 * Persists a snapshot and emits events.
 */
export function computeHealthScore(): HealthScoreResult {
  const factors = collectAllFactors();

  // Compute weighted sum
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedSum = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  const compositeScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;

  // Determine trend by comparing to recent snapshots
  const history = db.getHealthHistory(5);
  let trend: "improving" | "declining" | "stable" = "stable";
  if (history.length >= 2) {
    const avgPrevious = history.slice(0, 5).reduce((sum, h) => sum + h.composite_score, 0) / history.length;
    const diff = compositeScore - avgPrevious;
    if (diff > 5) trend = "improving";
    else if (diff < -5) trend = "declining";
  }

  // Persist snapshot
  db.insertHealthSnapshot(compositeScore, JSON.stringify(factors));

  // Emit snapshot event
  emitEvent({
    eventType: "health.snapshot",
    payload: { composite_score: compositeScore, trend, factor_count: factors.length },
  });

  // Alert if below threshold
  const alertThreshold = getConfigNumber("health_alert_threshold", 50);
  if (compositeScore < alertThreshold) {
    emitEvent({
      eventType: "health.alert",
      payload: {
        composite_score: compositeScore,
        threshold: alertThreshold,
        lowest_factor: factors.reduce((min, f) => f.score < min.score ? f : min, factors[0]).name,
      },
    });
  }

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  return { composite_score: compositeScore, trend, factors, computed_at: now };
}

/**
 * Get health history snapshots.
 */
export function getHealthHistoryQuery(limit?: number): {
  success: boolean;
  snapshots: Array<{ composite_score: number; factors: HealthFactor[]; computed_at: string }>;
} {
  const snapshots = db.getHealthHistory(limit ?? 20);
  return {
    success: true,
    snapshots: snapshots.map(s => ({
      composite_score: s.composite_score,
      factors: safeJsonParse<HealthFactor[]>(s.factors, []),
      computed_at: s.computed_at,
    })),
  };
}
