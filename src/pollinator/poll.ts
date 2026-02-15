import { scheduler } from "./scheduler.js";
import { buildSpawnRequest } from "./spawn.js";
import { claimFlight } from "../flight/claim.js";
import { logger } from "../lib/logger.js";
import type { PollinateResult, BlueprintSpec, BeeSpec } from "../types.js";

/**
 * Two-phase pollinate cycle:
 *  1. Refresh readiness across all registered bees (cheap peek queries)
 *  2. For each bee with work, claim a flight and build a spawn request
 *
 * Optionally filter to a specific swarm.
 */
export function pollinate(swarmId?: string): PollinateResult {
  // Phase 1: Refresh readiness
  scheduler.refreshReadiness();
  const beesWithWork = scheduler.getBeesWithWork();

  // Filter to specific swarm if requested
  const filtered = swarmId
    ? beesWithWork.filter(b => b.swarmId === swarmId)
    : beesWithWork;

  const result: PollinateResult = {
    spawns: [],
    beesChecked: beesWithWork.length,
    beesWithWork: filtered.length,
  };

  // Phase 2: Claim and build spawn requests
  for (const bee of filtered) {
    const claimResult = claimFlight(bee.beeId);
    if (!claimResult.claimed) continue;

    const blueprintSpec = scheduler.getBlueprintSpec(bee.swarmId);
    if (!blueprintSpec) {
      logger.warn("Pollinate: blueprint spec not found for swarm", { swarmId: bee.swarmId });
      continue;
    }

    const beeSpec = findBeeSpec(blueprintSpec, bee.beeId);
    if (!beeSpec) {
      logger.warn("Pollinate: bee spec not found", { beeId: bee.beeId });
      continue;
    }

    const spawn = buildSpawnRequest(claimResult.data, beeSpec, blueprintSpec);
    result.spawns.push(spawn);
  }

  logger.info("Pollinate cycle", {
    beesChecked: result.beesChecked,
    beesWithWork: result.beesWithWork,
    spawns: result.spawns.length,
  });

  return result;
}

/**
 * Find a bee spec by its fully-qualified ID (blueprintId_beeId).
 */
function findBeeSpec(blueprintSpec: BlueprintSpec, qualifiedBeeId: string): BeeSpec | undefined {
  const prefix = blueprintSpec.id + "_";
  if (!qualifiedBeeId.startsWith(prefix)) return undefined;
  const beeId = qualifiedBeeId.slice(prefix.length);
  return blueprintSpec.bees.find(b => b.id === beeId);
}
