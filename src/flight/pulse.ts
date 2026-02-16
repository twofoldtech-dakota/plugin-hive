import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import type { FlightPulseRecord } from "../types.js";

export type PulseResult =
  | { success: true; pulse: FlightPulseRecord }
  | { success: false; error: string };

/**
 * Report incremental progress on an in-flight flight.
 */
export function reportPulse(
  flightId: string,
  step: string,
  progress: number,
  message?: string,
): PulseResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { success: false, error: `Flight "${flightId}" not found` };
  }
  if (flight.status !== "in_flight") {
    return { success: false, error: `Flight is not in_flight (current: ${flight.status})` };
  }

  // Clamp progress to [0.0, 1.0]
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const pulse = db.insertPulse(flight.id, flight.swarm_id, step, clampedProgress, message);

  emitEvent({
    eventType: "flight.pulse",
    swarmId: flight.swarm_id,
    payload: { flight_id: flight.flight_id, step, progress: clampedProgress },
  });

  logger.info("Flight pulse", { flightId: flight.flight_id, step, progress: clampedProgress });
  return { success: true, pulse };
}

export interface FlightProgressResult {
  flight_id: string;
  flight_name: string;
  bee_id: string;
  status: string;
  pulses: FlightPulseRecord[];
}

export type GetProgressResult =
  | { success: true; flights: FlightProgressResult[] }
  | { success: false; error: string };

/**
 * Get progress pulses for a flight or all active flights in a swarm.
 */
export function getFlightProgress(opts: { flight_id?: string; swarm_id?: string }): GetProgressResult {
  if (opts.flight_id) {
    const flight = db.getFlight(opts.flight_id);
    if (!flight) {
      return { success: false, error: `Flight "${opts.flight_id}" not found` };
    }
    const pulses = db.getPulsesForFlight(flight.id);
    return {
      success: true,
      flights: [{
        flight_id: flight.id,
        flight_name: flight.flight_id,
        bee_id: flight.bee_id,
        status: flight.status,
        pulses,
      }],
    };
  }

  if (opts.swarm_id) {
    const swarm = db.getSwarm(opts.swarm_id);
    if (!swarm) {
      return { success: false, error: `Swarm "${opts.swarm_id}" not found` };
    }
    const flights = db.getFlightsForSwarm(swarm.id);
    const activeFlights = flights.filter(f => f.status === "in_flight");
    const results: FlightProgressResult[] = activeFlights.map(f => ({
      flight_id: f.id,
      flight_name: f.flight_id,
      bee_id: f.bee_id,
      status: f.status,
      pulses: db.getPulsesForFlight(f.id),
    }));
    return { success: true, flights: results };
  }

  return { success: false, error: "Provide either flight_id or swarm_id" };
}
