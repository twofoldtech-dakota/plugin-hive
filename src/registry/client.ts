import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { getConfigValue, getConfigNumber } from "../config/global.js";
import type { RegistryCacheRecord, BlueprintRatingRecord } from "../types.js";

interface RegistryEntry {
  id: string;
  name?: string;
  description?: string;
  version?: number;
  author?: string;
  tags?: string[];
  spec?: Record<string, unknown>;
  url?: string;
}

interface RegistryIndex {
  blueprints: RegistryEntry[];
  updated_at?: string;
}

/**
 * Sync blueprints from the configured registry URL into local cache.
 */
export async function syncRegistry(registryUrl?: string): Promise<
  { success: true; synced: number } | { success: false; error: string }
> {
  const url = registryUrl ?? getConfigValue("registry_url") ?? "";
  if (!url) {
    return { success: false, error: "No registry URL configured. Set registry_url in hive config." };
  }

  // Check cache freshness
  const cacheHours = getConfigNumber("registry_cache_hours", 24);
  const cacheAge = db.getRegistryCacheAge(url);
  if (cacheAge !== null && cacheAge < cacheHours) {
    logger.info("Registry cache is fresh, skipping sync", { url, ageHours: Math.round(cacheAge * 10) / 10 });
    return { success: true, synced: 0 };
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { success: false, error: `Registry returned HTTP ${response.status}` };
    }

    const index: RegistryIndex = await response.json() as RegistryIndex;

    if (!index.blueprints || !Array.isArray(index.blueprints)) {
      return { success: false, error: "Invalid registry format: missing blueprints array" };
    }

    // Clear old cache for this URL and re-populate
    db.clearRegistryCache(url);

    let synced = 0;
    for (const entry of index.blueprints) {
      db.upsertRegistryCache(
        url,
        entry.id,
        entry.name ?? null,
        entry.description ?? null,
        entry.version ?? null,
        entry.author ?? null,
        entry.tags ?? null,
      );
      synced++;
    }

    emitEvent({
      eventType: "registry.synced",
      payload: { registry_url: url, blueprints_synced: synced },
    });

    logger.info("Registry synced", { url, synced });
    return { success: true, synced };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Registry sync failed", { url, error: msg });
    return { success: false, error: `Sync failed: ${msg}` };
  }
}

/**
 * Search the registry cache for blueprints.
 */
export function searchRegistry(
  query: string,
  registryUrl?: string,
): RegistryCacheRecord[] {
  return db.searchRegistryCache(query, registryUrl);
}

/**
 * Install a blueprint from the registry.
 * Fetches the full spec from the registry entry's URL and installs locally.
 */
export async function installFromRegistry(
  blueprintId: string,
  registryUrl?: string,
): Promise<{ success: true; installed: string } | { success: false; error: string }> {
  const url = registryUrl ?? getConfigValue("registry_url") ?? "";
  if (!url) {
    return { success: false, error: "No registry URL configured" };
  }

  // Find in cache
  const results = db.searchRegistryCache(blueprintId, url);
  const entry = results.find(r => r.blueprint_id === blueprintId);
  if (!entry) {
    return { success: false, error: `Blueprint "${blueprintId}" not found in registry. Try syncing first.` };
  }

  // Fetch the full blueprint spec from registry
  try {
    const specUrl = `${url.replace(/\/$/, "")}/${blueprintId}.json`;
    const response = await fetch(specUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { success: false, error: `Failed to fetch blueprint spec: HTTP ${response.status}` };
    }

    const spec = await response.json() as Record<string, unknown>;

    // Install into local blueprints table (INSERT OR REPLACE)
    db.insertBlueprint(blueprintId, entry.name ?? null, entry.version ?? null, JSON.stringify(spec));

    logger.info("Blueprint installed from registry", { blueprintId, registryUrl: url });
    return { success: true, installed: blueprintId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Install failed: ${msg}` };
  }
}

/**
 * Rate a blueprint.
 */
export function rateBlueprint(
  blueprintId: string,
  rating: number,
  comment?: string,
): { success: true; rating: BlueprintRatingRecord } | { success: false; error: string } {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { success: false, error: "Rating must be an integer between 1 and 5" };
  }

  const record = db.insertBlueprintRating(blueprintId, rating, comment);

  emitEvent({
    eventType: "blueprint.rated",
    payload: { blueprint_id: blueprintId, rating, comment },
  });

  return { success: true, rating: record };
}

/**
 * Get ratings for a blueprint.
 */
export function getBlueprintRatings(blueprintId: string) {
  return db.getBlueprintRatings(blueprintId);
}
