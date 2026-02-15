import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";

export type StopSwarmResult =
  | { success: true; message: string }
  | { success: false; error: string };

export function stopSwarm(swarmId: string): StopSwarmResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }
  if (swarm.status !== "buzzing" && swarm.status !== "paused") {
    return { success: false, error: `Swarm is already ${swarm.status}` };
  }

  db.updateSwarm(swarmId, { status: "cancelled" });
  emitEvent({ eventType: "swarm.cancelled", swarmId });
  logger.info("Swarm cancelled", { swarmId });

  return { success: true, message: `Swarm #${swarm.swarm_number} cancelled` };
}
