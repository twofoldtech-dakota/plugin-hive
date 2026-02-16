import * as db from "../db.js";
import { createSwarmFromBlueprint } from "../swarm/create.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import type { ReplayOptions, SwarmRecord, SwarmArchiveRecord } from "../types.js";

export type ReplayResult =
  | { success: true; message: string; new_swarm_id: string; new_swarm_number: number; replayed_from: string }
  | { success: false; error: string };

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * Re-run a completed/failed/cancelled swarm with same or overridden parameters.
 * Creates a new independent swarm linked to the original via replayed_from.
 */
export function replaySwarm(swarmId: string, options?: ReplayOptions): ReplayResult {
  const found = db.getSwarmOrArchive(swarmId);
  if (!found) {
    return { success: false, error: `Swarm "${swarmId}" not found (checked active and archived)` };
  }

  let blueprintId: string;
  let originalTask: string;
  let originalId: string;
  let originalStatus: string;

  if (found.source === "swarm") {
    const swarm = found.data as SwarmRecord;
    if (!TERMINAL_STATUSES.has(swarm.status)) {
      return { success: false, error: `Cannot replay swarm in "${swarm.status}" status. Only completed/failed/cancelled swarms can be replayed.` };
    }
    blueprintId = swarm.blueprint_id;
    originalTask = swarm.task;
    originalId = swarm.id;
    originalStatus = swarm.status;
  } else {
    const archive = found.data as SwarmArchiveRecord;
    blueprintId = archive.blueprint_id;
    originalTask = archive.task;
    originalId = archive.id;
    originalStatus = archive.original_status;
  }

  // Verify blueprint is still installed
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" is no longer installed. Install it first.` };
  }

  const task = options?.task ?? originalTask;
  const variables = options?.variables;
  const priority = options?.priority;

  const createResult = createSwarmFromBlueprint(blueprintId, task, variables, undefined, undefined, { priority });
  if (!createResult.success) {
    return { success: false, error: createResult.error };
  }

  // Link new swarm to original
  db.setSwarmReplayedFrom(createResult.data.id, originalId);

  emitEvent({
    eventType: "swarm.replayed",
    swarmId: createResult.data.id,
    payload: {
      replayed_from: originalId,
      original_status: originalStatus,
      blueprint_id: blueprintId,
      task,
    },
  });

  logger.info("Swarm replayed", {
    newSwarmId: createResult.data.id,
    newSwarmNumber: createResult.data.number,
    replayedFrom: originalId,
  });

  return {
    success: true,
    message: `Swarm #${createResult.data.number} created as replay of "${originalId.slice(0, 8)}..."`,
    new_swarm_id: createResult.data.id,
    new_swarm_number: createResult.data.number,
    replayed_from: originalId,
  };
}
