import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { emitEvent } from "../lib/events.js";
import { scheduler } from "../pollinator/scheduler.js";
import { logger } from "../lib/logger.js";
import { getConfigNumber } from "../config/global.js";
import type { BlueprintSpec } from "../types.js";

export interface ConcurrencyCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a new buzzing swarm is allowed under concurrency limits.
 * Checks both global max_concurrent_swarms and blueprint-level concurrency.max_swarms.
 */
export function checkConcurrency(blueprintId: string): ConcurrencyCheckResult {
  const globalMax = getConfigNumber("max_concurrent_swarms", 5);

  // Global limit (0 = unlimited)
  if (globalMax > 0) {
    const current = db.countBuzzingSwarms();
    if (current >= globalMax) {
      return {
        allowed: false,
        reason: `Global concurrency limit reached (${current}/${globalMax} buzzing swarms)`,
      };
    }
  }

  // Blueprint-level limit
  const bp = db.getBlueprint(blueprintId);
  if (bp) {
    const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
    if (spec?.concurrency?.max_swarms) {
      const bpCount = db.countBuzzingSwarms(blueprintId);
      if (bpCount >= spec.concurrency.max_swarms) {
        return {
          allowed: false,
          reason: `Blueprint "${blueprintId}" concurrency limit reached (${bpCount}/${spec.concurrency.max_swarms})`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Promote highest-priority queued swarms when concurrency slots open.
 * Called after swarm completion or cancellation.
 */
export function promoteQueuedSwarms(): number {
  const globalMax = getConfigNumber("max_concurrent_swarms", 5);
  const queued = db.getQueuedSwarms();
  let promoted = 0;

  for (const swarm of queued) {
    // Re-check global limit
    if (globalMax > 0) {
      const current = db.countBuzzingSwarms();
      if (current >= globalMax) break;
    }

    // Check blueprint-level limit
    const bp = db.getBlueprint(swarm.blueprint_id);
    if (bp) {
      const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
      if (spec?.concurrency?.max_swarms) {
        const bpCount = db.countBuzzingSwarms(swarm.blueprint_id);
        if (bpCount >= spec.concurrency.max_swarms) continue;
      }
    }

    // Promote
    db.updateSwarm(swarm.id, { status: "buzzing" });
    db.bumpEpoch();
    emitEvent({
      eventType: "swarm.promoted",
      swarmId: swarm.id,
      payload: { from: "queued", priority: swarm.priority },
    });

    // Register with scheduler
    if (bp) {
      const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
      if (spec) scheduler.registerSwarm(swarm.id, spec);
    }

    logger.info("Queued swarm promoted", { swarmId: swarm.id, swarmNumber: swarm.swarm_number });
    promoted++;
  }

  return promoted;
}
