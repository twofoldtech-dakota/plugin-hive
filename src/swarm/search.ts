import * as db from "../db.js";
import type { SwarmSearchFilters, SwarmSearchResult, SwarmRecord } from "../types.js";

/**
 * Rich multi-filter swarm search with tag support.
 * Tags are filtered via EXISTS subqueries to avoid row multiplication.
 */
export function searchSwarms(filters: SwarmSearchFilters): SwarmSearchResult {
  const result = db.searchSwarms({
    query: filters.query,
    status: filters.status,
    blueprint_id: filters.blueprint_id,
    tags: filters.tags,
    from: filters.from,
    to: filters.to,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  });

  // Enrich swarms with their tags
  const enriched = result.swarms.map(swarm => {
    const tags = db.getSwarmTags(swarm.id);
    const tagMap: Record<string, string> = {};
    for (const t of tags) {
      tagMap[t.key] = t.value;
    }
    return { ...swarm, tags: tagMap };
  });

  return {
    swarms: enriched,
    total: result.total,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  };
}
