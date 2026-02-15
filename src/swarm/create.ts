import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
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

export function createSwarmFromBlueprint(blueprintId: string, task: string): CreateSwarmResult {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" is not installed. Use hive_blueprint_install first.` };
  }

  const spec: BlueprintSpec = JSON.parse(bp.spec);
  const nectar: Record<string, string> = { task, ...(spec.nectar ?? {}) };
  const swarm = db.createSwarm(blueprintId, task, nectar, spec.notifications?.url);

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
    );
    flightIndex++;
    insertedCount++;
  }

  emitEvent({ eventType: "swarm.started", swarmId: swarm.id, payload: { blueprint_id: blueprintId, task } });
  logger.info("Swarm started", { swarmId: swarm.id, swarmNumber: swarm.swarm_number, blueprint_id: blueprintId });

  return {
    success: true,
    data: {
      id: swarm.id,
      number: swarm.swarm_number,
      blueprint: blueprintId,
      task,
      status: swarm.status,
      flights: insertedCount,
    },
  };
}
