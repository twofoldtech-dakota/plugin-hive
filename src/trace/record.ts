import * as db from "../db.js";
import type { FlightTraceRecord } from "../types.js";

/**
 * Insert a flight trace record at a key lifecycle point.
 */
export function insertTrace(
  flightId: string,
  swarmId: string,
  traceType: "claimed" | "output" | "error" | "retry",
  data: Record<string, unknown>,
): FlightTraceRecord {
  return db.insertFlightTrace(flightId, swarmId, traceType, data);
}
