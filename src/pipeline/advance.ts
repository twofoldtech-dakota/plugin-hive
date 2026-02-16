import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import { evaluateWhen } from "../flight/when.js";
import { parseGateSpec, resolveGatePolicy, shouldAutoApprove } from "../flight/gate-policy.js";
import { checkAndFireTriggers } from "../chain/trigger.js";
import { checkpointOnTransition } from "../snapshot/checkpoint.js";
import { promoteQueuedSwarms } from "../concurrency/enforce.js";
import { launchSubSwarm } from "../flight/sub-swarm.js";
import { handleSubSwarmCompletion } from "../flight/sub-swarm.js";
import { nowUtc } from "../lib/time.js";
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

    // Enrich completion event with timing summary
    const flightDurations = db.getFlightDurations(swarmId);
    const totalSeconds = flightDurations.reduce((sum, f) => sum + (f.duration_seconds ?? 0), 0);
    emitEvent({
      eventType: "swarm.completed",
      swarmId,
      payload: {
        flights_completed: regularFlights.length,
        total_duration_seconds: totalSeconds,
      },
    });
    logger.info("Swarm completed", { swarmId });

    checkpointOnTransition(swarmId, "swarm_completed");

    // Check and fire triggers
    checkAndFireTriggers(swarmId, "swarm.completed");

    // Promote queued swarms now that a slot is open
    promoteQueuedSwarms();

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
 * Promote a flight or gate it. Handles when-clause evaluation and gate checks.
 * Returns: "promoted" | "skipped" | "gated"
 */
function promoteOrGate(flight: FlightRecord, swarmId: string): "promoted" | "skipped" | "gated" {
  // Check when clause
  if (flight.when_clause) {
    const swarm = db.getSwarm(swarmId);
    const nectar = swarm ? safeJsonParse<Record<string, string>>(swarm.nectar, {}) : {};
    if (!evaluateWhen(flight.when_clause, nectar)) {
      // Skip this flight
      db.updateFlight(flight.id, { status: "done", output: "SKIPPED: when clause not met" });
      emitEvent({ eventType: "flight.skipped", swarmId, payload: { flight_id: flight.flight_id, when_clause: flight.when_clause } });
      logger.info("Flight skipped (when clause)", { flightId: flight.flight_id, when: flight.when_clause });
      return "skipped";
    }
  }

  // Check gate
  if (flight.gate) {
    const gateSpec = parseGateSpec(flight.gate);
    const policy = resolveGatePolicy(gateSpec);

    // Check auto-approve condition
    if (policy.auto_approve_when) {
      const swarm = db.getSwarm(swarmId);
      const nectar = swarm ? safeJsonParse<Record<string, string>>(swarm.nectar, {}) : {};
      if (shouldAutoApprove(policy, nectar)) {
        // Auto-approve: skip gated, promote directly
        db.updateFlight(flight.id, { status: "pending" });
        emitEvent({ eventType: "gate.auto_approved", swarmId, payload: { flight_id: flight.flight_id, condition: policy.auto_approve_when } });
        logger.info("Flight gate auto-approved", { flightId: flight.flight_id, condition: policy.auto_approve_when });
        return "promoted";
      }
    }

    // Enter gated status with timestamp
    db.updateFlight(flight.id, { status: "gated", gated_at: nowUtc() });
    emitEvent({ eventType: "flight.gated", swarmId, payload: { flight_id: flight.flight_id, gate: flight.gate } });
    logger.info("Flight gated", { flightId: flight.flight_id, gate: flight.gate });
    return "gated";
  }

  // Handle sub_swarm flight type: launch child swarm instead of marking pending
  if (flight.type === "sub_swarm") {
    const result = launchSubSwarm(flight, swarmId);
    if (result.success) {
      return "promoted";
    }
    // Sub-swarm launch failed — treat as skip with error
    db.updateFlight(flight.id, { status: "failed", output: result.error });
    emitEvent({ eventType: "flight.failed", swarmId, payload: { flight_id: flight.flight_id, error: result.error } });
    return "skipped";
  }

  // Normal promotion
  db.updateFlight(flight.id, { status: "pending" });
  emitEvent({ eventType: "flight.ready", swarmId, payload: { flight_id: flight.flight_id } });
  return "promoted";
}

/**
 * DAG mode: promote all waiting flights whose dependencies are satisfied.
 */
function advanceDAG(swarmId: string, regularFlights: FlightRecord[]): AdvanceResult {
  const doneIds = new Set(
    regularFlights.filter(f => f.status === "done").map(f => f.flight_id),
  );

  const advanced: string[] = [];
  let anyGated = false;
  let anySkipped = false;

  for (const flight of regularFlights) {
    if (flight.status !== "waiting") continue;
    const deps = safeJsonParse<string[]>(flight.depends_on ?? "", []);
    if (deps.length === 0 || deps.every(d => doneIds.has(d))) {
      const result = promoteOrGate(flight, swarmId);
      if (result === "promoted") {
        advanced.push(flight.flight_id);
      } else if (result === "skipped") {
        anySkipped = true;
        doneIds.add(flight.flight_id); // skipped flights count as done for dependents
      } else if (result === "gated") {
        anyGated = true;
      }
    }
  }

  // If flights were skipped, recurse to pick up newly-unblocked dependents
  if (anySkipped) {
    const recursed = advancePipeline(swarmId);
    if (recursed.action === "completed") return recursed;
    if (recursed.advancedFlights) {
      advanced.push(...recursed.advancedFlights);
    }
  }

  // If ALL promotable flights were gated and nothing else can advance, block the swarm
  if (anyGated && advanced.length === 0) {
    const hasOtherActive = regularFlights.some(f =>
      f.status === "pending" || f.status === "in_flight",
    );
    if (!hasOtherActive) {
      db.updateSwarm(swarmId, { status: "blocked" });
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
      const canAdvance =
        prevIndex < 0 ||
        regularFlights.find(f => f.flight_index === prevIndex)?.status === "done";

      if (canAdvance) {
        const result = promoteOrGate(flight, swarmId);
        if (result === "promoted") {
          db.bumpEpoch();
          return { action: "advanced", advancedFlights: [flight.flight_id] };
        }
        if (result === "skipped") {
          db.bumpEpoch();
          // Recurse to pick up the next flight
          const recursed = advancePipeline(swarmId);
          if (recursed.action === "completed") return recursed;
          const allAdvanced = [flight.flight_id, ...(recursed.advancedFlights ?? [])];
          return { action: "advanced", advancedFlights: allAdvanced };
        }
        if (result === "gated") {
          // Block the swarm since sequential can only advance one at a time
          const hasOtherActive = regularFlights.some(f =>
            f.status === "pending" || f.status === "in_flight",
          );
          if (!hasOtherActive) {
            db.updateSwarm(swarmId, { status: "blocked" });
          }
          return { action: "none" };
        }
      }
      break;
    }
  }

  return { action: "none" };
}
