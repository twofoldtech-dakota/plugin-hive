import * as db from "../db.js";
import { advancePipeline } from "../pipeline/advance.js";
import { scheduler } from "../pollinator/scheduler.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import type { RemediationResult } from "../types.js";

/**
 * Reset a stuck flight to pending and increment abandoned_count.
 * If abandoned_count >= 5, fail it instead.
 */
export function resetStuckFlight(flightId: string): RemediationResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { action: "resetStuckFlight", entity_id: flightId, success: false, detail: "Flight not found" };
  }

  const newAbandonCount = flight.abandoned_count + 1;

  if (newAbandonCount >= 5) {
    db.updateFlight(flightId, { status: "failed", abandoned_count: newAbandonCount });
    db.updateSwarm(flight.swarm_id, { status: "failed" });
    emitEvent({ eventType: "flight.failed", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id, reason: "exhausted_abandons" } });
    emitEvent({ eventType: "swarm.failed", swarmId: flight.swarm_id, payload: { reason: "flight_exhausted" } });
    logger.info("Beekeeper: failed exhausted flight", { flightId, abandonCount: newAbandonCount });
    return { action: "resetStuckFlight", entity_id: flightId, success: true, detail: `Failed flight (abandoned ${newAbandonCount}/5)` };
  }

  db.updateFlight(flightId, { status: "pending", abandoned_count: newAbandonCount, current_cell_id: null });
  logger.info("Beekeeper: reset stuck flight", { flightId, abandonCount: newAbandonCount });
  return { action: "resetStuckFlight", entity_id: flightId, success: true, detail: `Reset to pending (abandoned ${newAbandonCount}/5)` };
}

/**
 * Advance a stalled swarm's pipeline.
 */
export function advanceStalledSwarm(swarmId: string): RemediationResult {
  const result = advancePipeline(swarmId);
  logger.info("Beekeeper: advanced stalled swarm", { swarmId, action: result.action });
  return { action: "advanceStalledSwarm", entity_id: swarmId, success: true, detail: `Pipeline advance: ${result.action}` };
}

/**
 * Resolve a zombie swarm — mark completed if all flights done, failed if any failed.
 */
export function resolveZombieSwarm(swarmId: string): RemediationResult {
  const flights = db.getFlightsForSwarm(swarmId);
  const regularFlights = flights.filter((f) => !f.verify_meta);
  const anyFailed = regularFlights.some((f) => f.status === "failed");

  if (anyFailed) {
    db.updateSwarm(swarmId, { status: "failed" });
    emitEvent({ eventType: "swarm.failed", swarmId, payload: { reason: "zombie_resolved" } });
    logger.info("Beekeeper: resolved zombie swarm as failed", { swarmId });
    return { action: "resolveZombieSwarm", entity_id: swarmId, success: true, detail: "Marked failed (has failed flights)" };
  }

  db.updateSwarm(swarmId, { status: "completed" });
  emitEvent({ eventType: "swarm.completed", swarmId, payload: { reason: "zombie_resolved" } });
  logger.info("Beekeeper: resolved zombie swarm as completed", { swarmId });
  return { action: "resolveZombieSwarm", entity_id: swarmId, success: true, detail: "Marked completed (all flights done)" };
}

/**
 * Unregister an orphaned scheduler entry.
 */
export function stopOrphanedScheduler(swarmId: string): RemediationResult {
  scheduler.unregisterSwarm(swarmId);
  logger.info("Beekeeper: unregistered orphaned scheduler", { swarmId });
  return { action: "stopOrphanedScheduler", entity_id: swarmId, success: true, detail: "Unregistered from scheduler" };
}

/**
 * Fail an exhausted flight and its swarm.
 */
export function failExhaustedFlight(flightId: string): RemediationResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { action: "failExhaustedFlight", entity_id: flightId, success: false, detail: "Flight not found" };
  }

  db.updateFlight(flightId, { status: "failed" });
  db.updateSwarm(flight.swarm_id, { status: "failed" });
  emitEvent({ eventType: "flight.failed", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id, reason: "exhausted_retries" } });
  emitEvent({ eventType: "swarm.failed", swarmId: flight.swarm_id, payload: { reason: "flight_exhausted" } });
  logger.info("Beekeeper: failed exhausted flight", { flightId, abandonCount: flight.abandoned_count });
  return { action: "failExhaustedFlight", entity_id: flightId, success: true, detail: `Failed flight and swarm (abandoned ${flight.abandoned_count} times)` };
}
