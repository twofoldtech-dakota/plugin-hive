import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { checkpointOnTransition } from "../snapshot/checkpoint.js";
import { promoteQueuedSwarms } from "../concurrency/enforce.js";

export type StopSwarmResult =
  | { success: true; message: string }
  | { success: false; error: string };

export function stopSwarm(swarmId: string): StopSwarmResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }
  if (swarm.status !== "buzzing" && swarm.status !== "paused" && swarm.status !== "blocked" && swarm.status !== "queued") {
    return { success: false, error: `Swarm is already ${swarm.status}` };
  }

  if (swarm.status !== "queued") {
    checkpointOnTransition(swarmId, "swarm_stop");
  }
  db.updateSwarm(swarmId, { status: "cancelled" });
  emitEvent({ eventType: "swarm.cancelled", swarmId });
  logger.info("Swarm cancelled", { swarmId });

  // Promote queued swarms now that a slot may be open
  promoteQueuedSwarms();

  return { success: true, message: `Swarm #${swarm.swarm_number} cancelled` };
}
