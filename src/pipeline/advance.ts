import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import type { AdvanceResult } from "../types.js";

/**
 * Advance the pipeline for a swarm after a flight completes.
 *
 * - If all flights are done → mark swarm completed → return "completed"
 * - If any flights failed → do nothing → return "none"
 * - Otherwise → promote the next waiting flight to pending → return "advanced"
 */
export function advancePipeline(swarmId: string): AdvanceResult {
  const flights = db.getFlightsForSwarm(swarmId);

  // Check if all flights are done (exclude verification flights from blocking)
  const regularFlights = flights.filter(f => !f.verify_meta);
  const allDone = regularFlights.every(f => f.status === "done");
  if (allDone) {
    db.updateSwarm(swarmId, { status: "completed" });
    emitEvent({ eventType: "swarm.completed", swarmId });
    logger.info("Swarm completed", { swarmId });
    return { action: "completed" };
  }

  // Check for failures
  const anyFailed = regularFlights.some(f => f.status === "failed");
  if (anyFailed) {
    return { action: "none" }; // Already handled in flight_fail
  }

  // Promote next waiting flight to pending
  for (const flight of regularFlights) {
    if (flight.status === "waiting") {
      const prevIndex = flight.flight_index - 1;
      if (prevIndex < 0) {
        db.updateFlight(flight.id, { status: "pending" });
        emitEvent({ eventType: "flight.ready", swarmId, payload: { flight_id: flight.flight_id } });
        return { action: "advanced" };
      }
      const prevFlight = regularFlights.find(f => f.flight_index === prevIndex);
      if (prevFlight && prevFlight.status === "done") {
        db.updateFlight(flight.id, { status: "pending" });
        emitEvent({ eventType: "flight.ready", swarmId, payload: { flight_id: flight.flight_id } });
        return { action: "advanced" };
      }
      break;
    }
  }

  return { action: "none" };
}
