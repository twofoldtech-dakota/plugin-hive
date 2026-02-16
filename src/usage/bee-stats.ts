import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import type { BeeStatsRecord } from "../types.js";

/**
 * Update bee stats after a flight completion or failure.
 */
export function updateBeeStats(
  beeId: string,
  success: boolean,
  durationSeconds: number,
  tokens: number = 0,
): BeeStatsRecord {
  const result = db.upsertBeeStats(beeId, success, durationSeconds, tokens);
  logger.info("Bee stats updated", { beeId, success, durationSeconds, tokens });
  return result;
}

export type GetBeeStatsResult =
  | { success: true; stats: BeeStatsRecord[] }
  | { success: false; error: string };

/**
 * Get stats for a specific bee or all bees in a blueprint.
 */
export function getBeeStatsQuery(beeId?: string, blueprintId?: string): GetBeeStatsResult {
  if (beeId) {
    const stats = db.getBeeStats(beeId);
    if (!stats) {
      return { success: true, stats: [] };
    }
    return { success: true, stats: [stats] };
  }

  if (blueprintId) {
    const stats = db.getBeeStatsForBlueprint(blueprintId);
    return { success: true, stats };
  }

  const stats = db.getAllBeeStats();
  return { success: true, stats };
}
