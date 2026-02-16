import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { advancePipeline } from "./advance.js";
import { nowUtc } from "../lib/time.js";
import type { FlightInjectResult, FlightSkipResult } from "../types.js";

export type InjectResult =
  | { success: true; result: FlightInjectResult }
  | { success: false; error: string };

export type SkipResult =
  | { success: true; result: FlightSkipResult }
  | { success: false; error: string };

/**
 * Inject a new flight into a running pipeline after a specified flight.
 */
export function injectFlight(
  swarmId: string,
  afterFlightId: string,
  beeId: string,
  input: string,
  expects?: string,
): InjectResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  if (!["buzzing", "paused", "blocked"].includes(swarm.status)) {
    return { success: false, error: `Cannot inject into swarm with status "${swarm.status}". Must be buzzing, paused, or blocked.` };
  }

  const flights = db.getFlightsForSwarm(swarmId);
  const afterFlight = flights.find(f => f.flight_id === afterFlightId || f.id === afterFlightId);
  if (!afterFlight) {
    return { success: false, error: `Flight "${afterFlightId}" not found in swarm` };
  }

  // Compute new flight_index (insert between afterFlight and next)
  const newIndex = afterFlight.flight_index + 0.5;
  const flightId = `injected-${Date.now().toString(36)}`;

  // Determine initial status
  const status = afterFlight.status === "done" ? "pending" : "waiting";

  const inserted = db.insertFlight(
    swarmId,
    flightId,
    beeId,
    newIndex,
    input,
    expects ?? "STATUS: done",
    status,
    2, // max_retries
    "single",
  );

  db.bumpEpoch();

  emitEvent({
    eventType: "flight.injected",
    swarmId,
    payload: {
      flight_id: flightId,
      after_flight_id: afterFlightId,
      bee_id: beeId,
      status,
    },
  });

  logger.info("Flight injected", { swarmId, flightId, afterFlightId, beeId });

  return {
    success: true,
    result: {
      success: true,
      flight_uuid: inserted.id,
      flight_id: flightId,
      flight_index: newIndex,
      message: `Flight "${flightId}" injected after "${afterFlightId}" with status "${status}"`,
    },
  };
}

/**
 * Skip a pending or waiting flight, marking it done with SKIPPED output.
 */
export function skipFlight(
  flightId: string,
  reason?: string,
): SkipResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { success: false, error: `Flight "${flightId}" not found` };
  }

  if (!["waiting", "pending"].includes(flight.status)) {
    return { success: false, error: `Cannot skip flight with status "${flight.status}". Must be waiting or pending.` };
  }

  const skipReason = reason ?? "manually skipped";
  const output = `SKIPPED: ${skipReason}`;

  db.updateFlight(flightId, {
    status: "done",
    output,
    completed_at: nowUtc(),
  });

  db.bumpEpoch();

  emitEvent({
    eventType: "flight.skipped_manual",
    swarmId: flight.swarm_id,
    payload: { flight_id: flight.flight_id, reason: skipReason },
  });

  // Advance pipeline since this flight is now done
  advancePipeline(flight.swarm_id);

  logger.info("Flight skipped", { flightId, flightName: flight.flight_id, reason: skipReason });

  return {
    success: true,
    result: {
      success: true,
      flight_id: flight.flight_id,
      message: `Flight "${flight.flight_id}" skipped: ${skipReason}`,
    },
  };
}
