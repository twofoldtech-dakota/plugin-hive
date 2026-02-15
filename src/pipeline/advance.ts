import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import type { AdvanceResult, FlightRecord } from "../types.js";

/**
 * Advance the pipeline for a swarm after a flight completes.
 * Automatically detects DAG vs sequential mode based on depends_on fields.
 */
export function advancePipeline(swarmId: string): AdvanceResult {
  const flights = db.getFlightsForSwarm(swarmId);
  const regularFlights = flights.filter(f => !f.verify_meta);

  // Check if all flights are done (exclude verification flights from blocking)
  const allDone = regularFlights.every(f => f.status === "done");
  if (allDone) {
    db.updateSwarm(swarmId, { status: "completed" });
    db.bumpEpoch();
    emitEvent({ eventType: "swarm.completed", swarmId });
    logger.info("Swarm completed", { swarmId });
    return { action: "completed" };
  }

  // Check for failures
  const anyFailed = regularFlights.some(f => f.status === "failed");
  if (anyFailed) {
    return { action: "none" }; // Already handled in flight_fail
  }

  // Detect DAG mode
  const isDAG = regularFlights.some(f => f.depends_on !== null);
  if (isDAG) {
    return advanceDAG(swarmId, regularFlights);
  }
  return advanceSequential(swarmId, regularFlights);
}

/**
 * DAG mode: promote all waiting flights whose dependencies are satisfied.
 */
function advanceDAG(swarmId: string, regularFlights: FlightRecord[]): AdvanceResult {
  const doneIds = new Set(
    regularFlights.filter(f => f.status === "done").map(f => f.flight_id),
  );

  const advanced: string[] = [];
  for (const flight of regularFlights) {
    if (flight.status !== "waiting") continue;
    const deps = safeJsonParse<string[]>(flight.depends_on ?? "", []);
    if (deps.length === 0 || deps.every(d => doneIds.has(d))) {
      db.updateFlight(flight.id, { status: "pending" });
      emitEvent({ eventType: "flight.ready", swarmId, payload: { flight_id: flight.flight_id } });
      advanced.push(flight.flight_id);
    }
  }

  if (advanced.length > 0) {
    db.bumpEpoch();
    return { action: "advanced", advancedFlights: advanced };
  }
  return { action: "none" };
}

/**
 * Sequential mode (legacy): promote the next waiting flight whose predecessor is done.
 */
function advanceSequential(swarmId: string, regularFlights: FlightRecord[]): AdvanceResult {
  for (const flight of regularFlights) {
    if (flight.status === "waiting") {
      const prevIndex = flight.flight_index - 1;
      if (prevIndex < 0) {
        db.updateFlight(flight.id, { status: "pending" });
        db.bumpEpoch();
        emitEvent({ eventType: "flight.ready", swarmId, payload: { flight_id: flight.flight_id } });
        return { action: "advanced", advancedFlights: [flight.flight_id] };
      }
      const prevFlight = regularFlights.find(f => f.flight_index === prevIndex);
      if (prevFlight && prevFlight.status === "done") {
        db.updateFlight(flight.id, { status: "pending" });
        db.bumpEpoch();
        emitEvent({ eventType: "flight.ready", swarmId, payload: { flight_id: flight.flight_id } });
        return { action: "advanced", advancedFlights: [flight.flight_id] };
      }
      break;
    }
  }

  return { action: "none" };
}
