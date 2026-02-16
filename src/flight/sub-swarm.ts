import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import { resolveNectar } from "./template.js";
import { createSwarmFromBlueprint } from "../swarm/create.js";
import { advancePipeline } from "../pipeline/advance.js";
import type { SubSwarmConfig, FlightRecord, SwarmRecord } from "../types.js";

/**
 * Launch a sub-swarm for a flight with type: sub_swarm.
 * Called when a sub_swarm flight is promoted to pending.
 */
export function launchSubSwarm(
  flight: FlightRecord,
  swarmId: string,
): { success: true; childSwarmId: string } | { success: false; error: string } {
  const config = safeJsonParse<SubSwarmConfig | null>(flight.sub_swarm_config ?? "", null);
  if (!config) {
    return { success: false, error: "No sub_swarm_config on flight" };
  }

  // Get parent swarm nectar for task template resolution
  const parentSwarm = db.getSwarm(swarmId);
  if (!parentSwarm) return { success: false, error: "Parent swarm not found" };

  const nectar = safeJsonParse<Record<string, string>>(parentSwarm.nectar, {});
  const task = resolveNectar(config.task_template, nectar);

  // Merge variables
  const variables = config.variables ?? {};

  // Create child swarm
  const result = createSwarmFromBlueprint(config.blueprint, task, variables);
  if (!result.success) {
    return { success: false, error: `Sub-swarm creation failed: ${result.error}` };
  }

  const childSwarmId = result.data.id;

  // Link parent flight ↔ child swarm
  db.setFlightChildSwarm(flight.id, childSwarmId);
  db.setSwarmParentFlight(childSwarmId, flight.id);

  emitEvent({
    eventType: "subswarm.started",
    swarmId,
    payload: {
      parent_flight_id: flight.id,
      child_swarm_id: childSwarmId,
      child_blueprint: config.blueprint,
    },
  });

  logger.info("Sub-swarm launched", {
    parentSwarmId: swarmId,
    childSwarmId,
    blueprint: config.blueprint,
  });

  return { success: true, childSwarmId };
}

/**
 * Handle child swarm completion: map nectar back and complete the parent flight.
 * Called when a swarm that has parent_flight_id completes.
 */
export function handleSubSwarmCompletion(childSwarm: SwarmRecord): void {
  if (!childSwarm.parent_flight_id) return;

  const parentFlight = db.getFlight(childSwarm.parent_flight_id);
  if (!parentFlight) {
    logger.warn("Parent flight not found for sub-swarm completion", {
      childSwarmId: childSwarm.id,
      parentFlightId: childSwarm.parent_flight_id,
    });
    return;
  }

  const config = safeJsonParse<SubSwarmConfig | null>(parentFlight.sub_swarm_config ?? "", null);
  const childNectar = safeJsonParse<Record<string, string>>(childSwarm.nectar, {});

  // Map child nectar back to parent using nectar_map
  if (config?.nectar_map) {
    const parentSwarm = db.getSwarm(parentFlight.swarm_id);
    if (parentSwarm) {
      const parentNectar = safeJsonParse<Record<string, string>>(parentSwarm.nectar, {});
      for (const [parentKey, childKey] of Object.entries(config.nectar_map)) {
        if (childNectar[childKey] !== undefined) {
          parentNectar[parentKey] = childNectar[childKey];
        }
      }
      db.updateSwarm(parentFlight.swarm_id, { nectar: JSON.stringify(parentNectar) });
    }
  }

  // Complete the parent flight
  const output = `SUB_SWARM_COMPLETED: ${childSwarm.id}\nSTATUS: done`;
  db.updateFlight(parentFlight.id, {
    status: "done",
    output,
    completed_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  db.bumpEpoch();

  emitEvent({
    eventType: "subswarm.completed",
    swarmId: parentFlight.swarm_id,
    payload: {
      parent_flight_id: parentFlight.id,
      child_swarm_id: childSwarm.id,
    },
  });

  // Advance parent pipeline
  advancePipeline(parentFlight.swarm_id);

  logger.info("Sub-swarm completed, parent flight advanced", {
    childSwarmId: childSwarm.id,
    parentFlightId: parentFlight.id,
  });
}

/**
 * Handle child swarm failure: fail the parent flight.
 */
export function handleSubSwarmFailure(childSwarm: SwarmRecord): void {
  if (!childSwarm.parent_flight_id) return;

  const parentFlight = db.getFlight(childSwarm.parent_flight_id);
  if (!parentFlight) return;

  db.updateFlight(parentFlight.id, {
    status: "failed",
    output: `Sub-swarm ${childSwarm.id} failed`,
    completed_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  db.updateSwarm(parentFlight.swarm_id, { status: "failed" });
  db.bumpEpoch();

  emitEvent({
    eventType: "subswarm.failed",
    swarmId: parentFlight.swarm_id,
    payload: {
      parent_flight_id: parentFlight.id,
      child_swarm_id: childSwarm.id,
    },
  });

  logger.error("Sub-swarm failed, parent swarm marked failed", {
    childSwarmId: childSwarm.id,
    parentFlightId: parentFlight.id,
  });
}

/**
 * Get sub-swarm status for a parent flight.
 */
export function getSubSwarmStatus(flightUuid: string) {
  const flight = db.getFlight(flightUuid);
  if (!flight || !flight.child_swarm_id) {
    return { success: false, error: "Flight not found or no sub-swarm" };
  }

  const childSwarm = db.getSwarm(flight.child_swarm_id);
  if (!childSwarm) {
    return { success: false, error: "Child swarm not found" };
  }

  const childFlights = db.getFlightsForSwarm(childSwarm.id);
  return {
    success: true,
    data: {
      parent_flight_id: flightUuid,
      child_swarm: {
        id: childSwarm.id,
        number: childSwarm.swarm_number,
        blueprint: childSwarm.blueprint_id,
        status: childSwarm.status,
        task: childSwarm.task,
      },
      child_flights: childFlights.map(f => ({
        id: f.flight_id,
        status: f.status,
        bee: f.bee_id,
      })),
    },
  };
}
