import * as db from "../db.js";
import type { FlightTraceRecord } from "../types.js";

export type FlightTraceResult =
  | { success: true; traces: FlightTraceRecord[] }
  | { success: false; error: string };

/**
 * Get traces for a specific flight.
 */
export function getFlightTraces(flightId: string): FlightTraceResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { success: false, error: `Flight "${flightId}" not found` };
  }
  const traces = db.getTracesForFlight(flightId);
  return { success: true, traces };
}

/**
 * Get all traces for a swarm (across all flights).
 */
export function getSwarmTraces(swarmId: string): FlightTraceResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }
  const traces = db.getTracesForSwarm(swarmId);
  return { success: true, traces };
}
