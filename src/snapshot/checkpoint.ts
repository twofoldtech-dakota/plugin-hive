import * as db from "../db.js";
import { createSnapshot } from "./create.js";
import { safeJsonParse } from "../lib/json.js";
import { logger } from "../lib/logger.js";
import type { BlueprintSpec, SnapshotRecord } from "../types.js";

export type CheckpointResult =
  | { success: true; snapshot: SnapshotRecord }
  | { success: false; error: string };

/**
 * Create a checkpoint snapshot for a swarm.
 */
export function createCheckpoint(swarmId: string): CheckpointResult {
  const result = createSnapshot(swarmId, "checkpoint");
  if (!result.success) {
    return result;
  }
  return { success: true, snapshot: result.snapshot };
}

/**
 * Checkpoint on state transitions (gate approval, verification, swarm completion, swarm stop).
 * Only fires if the blueprint has `checkpoint_on_transitions: true` in beekeeper config.
 */
export function checkpointOnTransition(swarmId: string, transition: string): boolean {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) return false;

  const bp = db.getBlueprint(swarm.blueprint_id);
  if (!bp) return false;

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) return false;

  if (!spec.beekeeper?.checkpoint_on_transitions) return false;

  const result = createSnapshot(swarmId, "auto");
  if (result.success) {
    logger.info("Transition checkpoint created", { swarmId, transition });
    return true;
  }
  return false;
}

/**
 * Auto-checkpoint logic: create a checkpoint after every N flight completions.
 * Returns true if a checkpoint was created.
 */
export function maybeAutoCheckpoint(swarmId: string): boolean {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) return false;

  const bp = db.getBlueprint(swarm.blueprint_id);
  if (!bp) return false;

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) return false;

  const interval = spec.beekeeper?.checkpoint_interval;
  if (!interval || interval <= 0) return false;

  // Count completed flights
  const flights = db.getFlightsForSwarm(swarmId);
  const completedCount = flights.filter(f => f.status === "done" && !f.verify_meta).length;

  if (completedCount > 0 && completedCount % interval === 0) {
    const result = createSnapshot(swarmId, "auto");
    if (result.success) {
      logger.info("Auto-checkpoint created", { swarmId, completedFlights: completedCount });
      return true;
    }
  }

  return false;
}
