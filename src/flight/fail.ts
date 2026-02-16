import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { nowUtc } from "../lib/time.js";
import { computeRetryDelay, computeRetryAt } from "./backoff.js";
import { safeJsonParse } from "../lib/json.js";
import type { RetryStrategy } from "../types.js";

export type FailFlightResult =
  | { success: true; message: string; retrying: boolean }
  | { success: false; error: string };

export function failFlight(flightId: string, error: string): FailFlightResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { success: false, error: `Flight "${flightId}" not found` };
  }

  // Handle cell failure for loop flights
  if (flight.type === "loop" && flight.current_cell_id) {
    const cell = db.getCell(flight.current_cell_id);
    if (cell && cell.retry_count < cell.max_retries) {
      db.updateCell(cell.id, { status: "pending", retry_count: cell.retry_count + 1 });
      db.updateFlight(flightId, { status: "pending", current_cell_id: null });
      emitEvent({ eventType: "cell.failed", swarmId: flight.swarm_id, payload: { cell_id: cell.id, error, retrying: true } });
      return {
        success: true,
        retrying: true,
        message: `Cell "${cell.cell_id}" failed, retrying (attempt ${cell.retry_count + 1}/${cell.max_retries})`,
      };
    }
  }

  // Check retries for the flight itself
  if (flight.retry_count < flight.max_retries) {
    const strategy = safeJsonParse<RetryStrategy | null>(flight.retry_strategy ?? "", null);
    const newRetryCount = flight.retry_count + 1;
    const delaySeconds = computeRetryDelay(strategy, newRetryCount);
    const retryAt = computeRetryAt(delaySeconds);

    db.updateFlight(flightId, {
      status: "pending",
      retry_count: newRetryCount,
      current_cell_id: null,
      retry_at: retryAt,
    });
    emitEvent({ eventType: "flight.failed", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id, error, retrying: true, retry_at: retryAt } });
    const delayMsg = delaySeconds > 0 ? ` (delay: ${delaySeconds}s)` : "";
    return {
      success: true,
      retrying: true,
      message: `Flight "${flight.flight_id}" failed, retrying (attempt ${newRetryCount}/${flight.max_retries})${delayMsg}`,
    };
  }

  // No retries left — fail the flight and the swarm
  const now = nowUtc();
  db.updateFlight(flightId, { status: "failed", output: error, current_cell_id: null, completed_at: now });
  db.updateSwarm(flight.swarm_id, { status: "failed" });
  db.bumpEpoch();
  emitEvent({ eventType: "flight.failed", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id, error, retrying: false } });
  emitEvent({ eventType: "swarm.failed", swarmId: flight.swarm_id, payload: { reason: `Flight "${flight.flight_id}" exhausted retries` } });

  logger.error("Flight failed permanently", { flightId, error });
  return {
    success: true,
    retrying: false,
    message: `Flight "${flight.flight_id}" failed permanently. Swarm marked as failed.`,
  };
}
