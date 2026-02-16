import * as db from "../db.js";
import { advancePipeline } from "../pipeline/advance.js";
import { scheduler } from "../pollinator/scheduler.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { nowUtc } from "../lib/time.js";
import { archiveSwarm as doArchiveSwarm } from "../archive/archive.js";
import { runMaintenance } from "../maintenance/janitor.js";
import { handleSubSwarmFailure } from "../flight/sub-swarm.js";
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
    db.updateFlight(flightId, { status: "failed", abandoned_count: newAbandonCount, completed_at: nowUtc() });
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
 * Force-pass a cell stuck in a verification loop.
 */
export function forcePassCell(cellId: string): RemediationResult {
  const cell = db.getCell(cellId);
  if (!cell) {
    return { action: "forcePassCell", entity_id: cellId, success: false, detail: "Cell not found" };
  }

  db.updateCell(cellId, { status: "done", output: "FORCE_PASSED: beekeeper resolved verification loop", completed_at: nowUtc() });
  emitEvent({ eventType: "cell.completed", swarmId: cell.swarm_id, payload: { cell_id: cellId, force_passed: true } });
  logger.info("Beekeeper: force-passed verification loop cell", { cellId });
  return { action: "forcePassCell", entity_id: cellId, success: true, detail: `Force-passed cell (retried ${cell.retry_count} times)` };
}

/**
 * Reset a stuck cell back to pending.
 */
export function resetStuckCell(cellId: string): RemediationResult {
  const cell = db.getCell(cellId);
  if (!cell) {
    return { action: "resetStuckCell", entity_id: cellId, success: false, detail: "Cell not found" };
  }

  db.updateCell(cellId, { status: "pending" });
  logger.info("Beekeeper: reset stuck cell", { cellId });
  return { action: "resetStuckCell", entity_id: cellId, success: true, detail: "Reset cell to pending" };
}

/**
 * Retry a failed webhook delivery.
 */
export function retryWebhook(deliveryId: string): RemediationResult {
  const delivery = db.getWebhookDelivery(deliveryId);
  if (!delivery) {
    return { action: "retryWebhook", entity_id: deliveryId, success: false, detail: "Delivery not found" };
  }
  // Mark for retry by resetting next_retry_at to now
  db.updateWebhookDelivery(deliveryId, { next_retry_at: nowUtc() });
  logger.info("Beekeeper: marked webhook for retry", { deliveryId });
  return { action: "retryWebhook", entity_id: deliveryId, success: true, detail: `Marked delivery for retry (attempt ${delivery.attempts + 1})` };
}

/**
 * Auto-archive a swarm that's past retention.
 */
export function autoArchiveSwarm(swarmId: string): RemediationResult {
  const result = doArchiveSwarm(swarmId);
  if (result.success) {
    logger.info("Beekeeper: auto-archived swarm", { swarmId });
    return { action: "autoArchiveSwarm", entity_id: swarmId, success: true, detail: result.message };
  }
  return { action: "autoArchiveSwarm", entity_id: swarmId, success: false, detail: result.error };
}

/**
 * Auto-run data maintenance.
 */
export function autoMaintain(_entityId: string): RemediationResult {
  const result = runMaintenance(false);
  logger.info("Beekeeper: auto-maintenance completed", { totalDeleted: result.total_deleted });
  return {
    action: "autoMaintain",
    entity_id: "maintenance",
    success: true,
    detail: `Cleaned ${result.total_deleted} records (events: ${result.deleted.events}, traces: ${result.deleted.traces}, checks: ${result.deleted.checks}, webhooks: ${result.deleted.webhooks}, pulses: ${result.deleted.pulses})`,
  };
}

/**
 * Resolve an expired gate based on on_timeout policy (approve or reject).
 */
export function resolveExpiredGate(flightId: string): RemediationResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { action: "resolveExpiredGate", entity_id: flightId, success: false, detail: "Flight not found" };
  }

  let policy: { on_timeout?: string } = {};
  try {
    if (flight.gate && flight.gate !== "approval") {
      policy = JSON.parse(flight.gate);
    }
  } catch {
    // Fall through to default reject
  }

  const onTimeout = policy.on_timeout ?? "reject";

  if (onTimeout === "approve") {
    db.updateFlight(flightId, { status: "pending", gated_at: null });
    emitEvent({ eventType: "gate.timed_out", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id, action: "approved" } });
    logger.info("Beekeeper: gate timed out, auto-approved", { flightId });
    return { action: "resolveExpiredGate", entity_id: flightId, success: true, detail: "Gate expired — auto-approved per policy" };
  }

  // Reject: fail the flight and swarm
  db.updateFlight(flightId, { status: "failed", completed_at: nowUtc() });
  db.updateSwarm(flight.swarm_id, { status: "failed" });
  emitEvent({ eventType: "gate.timed_out", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id, action: "rejected" } });
  emitEvent({ eventType: "swarm.failed", swarmId: flight.swarm_id, payload: { reason: "gate_timeout" } });
  logger.info("Beekeeper: gate timed out, rejected", { flightId });
  return { action: "resolveExpiredGate", entity_id: flightId, success: true, detail: "Gate expired — rejected per policy" };
}

/**
 * Clean expired cache entries.
 */
export function cleanExpiredCache(_entityId: string): RemediationResult {
  const deleted = db.deleteExpiredCache();
  logger.info("Beekeeper: cleaned expired cache", { deleted });
  return {
    action: "cleanExpiredCache",
    entity_id: "cache",
    success: true,
    detail: `Deleted ${deleted} expired cache entries`,
  };
}

/**
 * Handle sub-swarm timeout: fail the child swarm and propagate failure to parent.
 */
export function timeoutSubSwarm(flightId: string): RemediationResult {
  const flight = db.getFlight(flightId);
  if (!flight || !flight.child_swarm_id) {
    return { action: "timeoutSubSwarm", entity_id: flightId, success: false, detail: "Flight not found or no child swarm" };
  }

  const childSwarm = db.getSwarm(flight.child_swarm_id);
  if (!childSwarm) {
    return { action: "timeoutSubSwarm", entity_id: flightId, success: false, detail: "Child swarm not found" };
  }

  // Fail the child swarm
  db.updateSwarm(childSwarm.id, { status: "failed" });
  emitEvent({
    eventType: "subswarm.timeout",
    swarmId: flight.swarm_id,
    payload: { parent_flight_id: flight.id, child_swarm_id: childSwarm.id },
  });

  // Propagate failure to parent
  handleSubSwarmFailure(childSwarm);

  logger.info("Beekeeper: sub-swarm timed out", { flightId, childSwarmId: childSwarm.id });
  return { action: "timeoutSubSwarm", entity_id: flightId, success: true, detail: `Sub-swarm ${childSwarm.id.slice(0, 8)} timed out and failed` };
}

/**
 * Fail an exhausted flight and its swarm.
 */
export function failExhaustedFlight(flightId: string): RemediationResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { action: "failExhaustedFlight", entity_id: flightId, success: false, detail: "Flight not found" };
  }

  db.updateFlight(flightId, { status: "failed", completed_at: nowUtc() });
  db.updateSwarm(flight.swarm_id, { status: "failed" });
  emitEvent({ eventType: "flight.failed", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id, reason: "exhausted_retries" } });
  emitEvent({ eventType: "swarm.failed", swarmId: flight.swarm_id, payload: { reason: "flight_exhausted" } });
  logger.info("Beekeeper: failed exhausted flight", { flightId, abandonCount: flight.abandoned_count });
  return { action: "failExhaustedFlight", entity_id: flightId, success: true, detail: `Failed flight and swarm (abandoned ${flight.abandoned_count} times)` };
}
