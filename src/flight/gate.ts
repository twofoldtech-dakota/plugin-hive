import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { checkpointOnTransition } from "../snapshot/checkpoint.js";

export type ApproveFlightResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Approve a gated flight, promoting it to pending and unblocking the swarm.
 */
export function approveFlight(flightId: string, message?: string): ApproveFlightResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { success: false, error: `Flight "${flightId}" not found` };
  }
  if (flight.status !== "gated") {
    return { success: false, error: `Flight is not gated (current status: ${flight.status})` };
  }

  // Promote to pending
  db.updateFlight(flightId, { status: "pending" });
  db.bumpEpoch();

  // If the swarm is blocked, set it back to buzzing
  const swarm = db.getSwarm(flight.swarm_id);
  if (swarm && swarm.status === "blocked") {
    db.updateSwarm(flight.swarm_id, { status: "buzzing" });
  }

  emitEvent({
    eventType: "flight.ready",
    swarmId: flight.swarm_id,
    payload: { flight_id: flight.flight_id, approved: true, message: message ?? null },
  });

  checkpointOnTransition(flight.swarm_id, "gate_approval");
  logger.info("Flight gate approved", { flightId: flight.flight_id, message });
  return { success: true, message: `Flight "${flight.flight_id}" approved and promoted to pending` };
}
