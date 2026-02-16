import { createHash } from "node:crypto";
import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { getConfigBoolean, getConfigNumber } from "../config/global.js";
import type { CacheEntry, CacheStats, CacheClearResult } from "../types.js";

/**
 * Compute SHA-256 hash of a resolved input string for cache key.
 */
export function computeInputHash(resolvedInput: string): string {
  return createHash("sha256").update(resolvedInput).digest("hex");
}

/**
 * Look up a cached flight result by (blueprint_id, flight_id, input_hash).
 * Returns null if cache is disabled, no entry exists, or entry is expired.
 */
export function getCached(
  blueprintId: string,
  flightId: string,
  inputHash: string,
): CacheEntry | null {
  if (!getConfigBoolean("cache_enabled", false)) return null;

  const entry = db.getCachedResult(blueprintId, flightId, inputHash);
  if (!entry) return null;

  logger.info("Cache hit", { blueprintId, flightId, inputHash: inputHash.slice(0, 12) });
  return entry;
}

/**
 * Store a flight result in the cache.
 */
export function cacheResult(
  blueprintId: string,
  flightId: string,
  inputHash: string,
  output: string,
  nectarKeys: string[] | null,
  ttlHours?: number,
): void {
  if (!getConfigBoolean("cache_enabled", false)) return;

  const ttl = ttlHours ?? getConfigNumber("cache_ttl_hours", 24);
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

  db.insertCacheEntry(blueprintId, flightId, inputHash, output, nectarKeys, expiresAt);
  logger.info("Cached flight result", { blueprintId, flightId, inputHash: inputHash.slice(0, 12), ttlHours: ttl });
}

/**
 * Get cache statistics.
 */
export function getCacheStatus(): CacheStats {
  const stats = db.getCacheStats();
  return {
    entries: stats.entries,
    total_hits: stats.total_hits,
    enabled: getConfigBoolean("cache_enabled", false),
    ttl_hours: getConfigNumber("cache_ttl_hours", 24),
    expired: stats.expired,
  };
}

/**
 * Clear cached results. Scope narrows by blueprint_id and flight_id.
 */
export function clearCache(blueprintId?: string, flightId?: string): CacheClearResult {
  const deleted = db.clearFlightCache(blueprintId, flightId);
  const scope = blueprintId
    ? flightId
      ? `${blueprintId}/${flightId}`
      : blueprintId
    : "all";
  logger.info("Cache cleared", { scope, deleted });
  return { deleted, scope };
}
