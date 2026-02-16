import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { validateInputs } from "../blueprint/info.js";
import { checkConcurrency } from "../concurrency/enforce.js";
import { serializeGateSpec } from "../flight/gate-policy.js";
import type { BlueprintSpec, FlightSpec } from "../types.js";

export type CreateSwarmResult =
  | {
      success: true;
      data: {
        id: string;
        number: number;
        blueprint: string;
        task: string;
        status: string;
        flights: number;
      };
    }
  | { success: false; error: string };

export function createSwarmFromBlueprint(blueprintId: string, task: string, variables?: Record<string, string>, chainId?: string, parentSwarmId?: string, opts?: { priority?: number; schedule_at?: string }): CreateSwarmResult {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" is not installed. Use hive_blueprint_install first.` };
  }

  const spec: BlueprintSpec = JSON.parse(bp.spec);

  // Validate and merge input variables
  const inputResult = validateInputs(spec, variables);
  if (!inputResult.valid) {
    return { success: false, error: inputResult.error };
  }

  const nectar: Record<string, string> = { task, ...(spec.nectar ?? {}), ...inputResult.merged };

  // Check concurrency limits (skip for scheduled swarms)
  let queued = false;
  if (!opts?.schedule_at) {
    const concurrencyResult = checkConcurrency(blueprintId);
    if (!concurrencyResult.allowed) {
      queued = true;
    }
  }

  const swarm = db.createSwarm(blueprintId, task, nectar, spec.notifications?.url, {
    chain_id: chainId,
    parent_swarm_id: parentSwarmId,
    priority: opts?.priority,
    schedule_at: opts?.schedule_at,
  });

  // Override to queued if concurrency limited
  if (queued && swarm.status === "buzzing") {
    db.updateSwarm(swarm.id, { status: "queued" });
  }

  // Collect flight IDs that are verify_flight templates (used dynamically, not as pipeline steps)
  const verifyFlightIds = new Set<string>();
  for (const flight of spec.flights) {
    if (flight.type === "loop" && flight.loop?.verify_each && flight.loop?.verify_flight) {
      verifyFlightIds.add(flight.loop.verify_flight);
    }
  }

  // Detect DAG mode: any non-template flight has depends_on
  const pipelineFlights = spec.flights.filter(f => !verifyFlightIds.has(f.id));
  const isDAG = pipelineFlights.some(f => f.depends_on && f.depends_on.length > 0);

  // Compute DAG roots (flights with no dependencies)
  const dagRoots = new Set<string>();
  if (isDAG) {
    for (const flight of pipelineFlights) {
      if (!flight.depends_on || flight.depends_on.length === 0) {
        dagRoots.add(flight.id);
      }
    }
  }

  // Insert flights from blueprint, skipping verify_flight templates
  let flightIndex = 0;
  let insertedCount = 0;
  for (const flight of spec.flights) {
    if (verifyFlightIds.has(flight.id)) {
      // This flight serves as a template for dynamic verification flights — skip it
      continue;
    }

    const beeId = `${blueprintId}_${flight.bee}`;
    let status: "pending" | "waiting";
    if (isDAG) {
      status = dagRoots.has(flight.id) ? "pending" : "waiting";
    } else {
      status = flightIndex === 0 ? "pending" : "waiting";
    }
    db.insertFlight(
      swarm.id,
      flight.id,
      beeId,
      flightIndex,
      flight.input,
      flight.expects,
      status,
      flight.max_retries ?? 2,
      flight.type ?? "single",
      flight.loop ? JSON.stringify(flight.loop) : undefined,
      flight.depends_on,
      flight.when,
      flight.gate ? serializeGateSpec(flight.gate) : undefined,
      flight.retry_strategy ? JSON.stringify(flight.retry_strategy) : undefined,
      flight.produces,
      flight.requires,
      flight.sub_swarm ? JSON.stringify(flight.sub_swarm) : undefined,
      flight.failover ? JSON.stringify(flight.failover) : undefined,
      flight.nectar_refs ? JSON.stringify(flight.nectar_refs) : undefined,
    );
    flightIndex++;
    insertedCount++;
  }

  const finalStatus = queued ? "queued" : swarm.status;

  if (swarm.status === "scheduled") {
    emitEvent({ eventType: "swarm.scheduled", swarmId: swarm.id, payload: { blueprint_id: blueprintId, task, schedule_at: opts?.schedule_at } });
    logger.info("Swarm scheduled", { swarmId: swarm.id, swarmNumber: swarm.swarm_number, schedule_at: opts?.schedule_at });
  } else if (queued) {
    emitEvent({ eventType: "swarm.queued", swarmId: swarm.id, payload: { blueprint_id: blueprintId, task, reason: "concurrency_limit" } });
    logger.info("Swarm queued (concurrency limit)", { swarmId: swarm.id, swarmNumber: swarm.swarm_number });
  } else {
    emitEvent({ eventType: "swarm.started", swarmId: swarm.id, payload: { blueprint_id: blueprintId, task } });
    logger.info("Swarm started", { swarmId: swarm.id, swarmNumber: swarm.swarm_number, blueprint_id: blueprintId });
  }

  return {
    success: true,
    data: {
      id: swarm.id,
      number: swarm.swarm_number,
      blueprint: blueprintId,
      task,
      status: finalStatus,
      flights: insertedCount,
    },
  };
}
