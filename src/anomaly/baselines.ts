import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import type { BlueprintSpec } from "../types.js";
import { safeJsonParse } from "../lib/json.js";

/**
 * Refresh baselines for a blueprint by computing mean/stddev from historical data.
 * Called periodically by the beekeeper monitor.
 */
export function refreshBaselines(blueprintId: string): { updated: number } {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) return { updated: 0 };

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) return { updated: 0 };

  let updated = 0;

  for (const flight of spec.flights) {
    // Duration baseline
    const durations = db.getCompletedFlightDurations(blueprintId, flight.id);
    if (durations.length >= 3) {
      const { mean, stddev } = computeStats(durations);
      db.upsertFlightBaseline(blueprintId, flight.id, "duration_seconds", mean, stddev, durations.length);
      updated++;
    }

    // Token baseline
    const tokens = db.getCompletedFlightTokens(blueprintId, flight.id);
    if (tokens.length >= 3) {
      const { mean, stddev } = computeStats(tokens);
      db.upsertFlightBaseline(blueprintId, flight.id, "tokens", mean, stddev, tokens.length);
      updated++;
    }
  }

  if (updated > 0) {
    logger.info("Baselines refreshed", { blueprintId, updated });
  }

  return { updated };
}

/**
 * Refresh baselines for all installed blueprints.
 */
export function refreshAllBaselines(): { blueprints: number; baselines: number } {
  const blueprints = db.listBlueprints();
  let totalBaselines = 0;
  let bpCount = 0;

  for (const bp of blueprints) {
    const result = refreshBaselines(bp.id);
    if (result.updated > 0) {
      bpCount++;
      totalBaselines += result.updated;
    }
  }

  return { blueprints: bpCount, baselines: totalBaselines };
}

/**
 * Get all baselines for a blueprint.
 */
export function getBaselines(blueprintId: string) {
  return db.getBaselinesForBlueprint(blueprintId);
}

/**
 * Compute mean and standard deviation for a dataset.
 */
export function computeStats(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  return {
    mean: Math.round(mean * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
  };
}
