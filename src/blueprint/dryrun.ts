import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { resolveNectar } from "../flight/template.js";
import { serializeGateSpec } from "../flight/gate-policy.js";
import type { BlueprintSpec, FlightSpec } from "../types.js";

export interface DryRunFlight {
  id: string;
  bee: string;
  type: string;
  order: number;
  depends_on?: string[];
  when?: string;
  gate?: string;
  produces?: string[];
  requires?: string[];
  resolved_input_preview: string;
  expects: string;
  would_skip: boolean;
}

export interface DryRunResult {
  blueprint_id: string;
  mode: "sequential" | "dag";
  flight_order: DryRunFlight[];
  total_flights: number;
  gated_flights: number;
  conditional_flights: number;
  nectar_flow: {
    available_keys: string[];
    produced_keys: string[];
  };
}

export type DryRunResponse =
  | { success: true; data: DryRunResult }
  | { success: false; error: string };

/**
 * Simulate pipeline execution without spawning bees.
 * Shows flight order, dependency graph, and template resolution preview.
 */
export function dryRunBlueprint(
  blueprintId: string,
  variables?: Record<string, string>,
): DryRunResponse {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" is not installed` };
  }

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) {
    return { success: false, error: `Blueprint "${blueprintId}" has invalid spec` };
  }

  // Build mock nectar for template preview
  const nectar: Record<string, string> = {
    task: variables?.task ?? "<task>",
    swarm_id: "<swarm_id>",
    progress: "<progress>",
    ...(spec.nectar ?? {}),
    ...(variables ?? {}),
  };

  // Apply input defaults
  if (spec.inputs) {
    for (const input of spec.inputs) {
      if (nectar[input.name] === undefined && input.default !== undefined) {
        nectar[input.name] = input.default;
      }
    }
  }

  // Collect verify_flight template IDs
  const verifyFlightIds = new Set<string>();
  for (const flight of spec.flights) {
    if (flight.type === "loop" && flight.loop?.verify_each && flight.loop?.verify_flight) {
      verifyFlightIds.add(flight.loop.verify_flight);
    }
  }

  const pipelineFlights = spec.flights.filter(f => !verifyFlightIds.has(f.id));
  const isDAG = pipelineFlights.some(f => f.depends_on && f.depends_on.length > 0);

  // Topological sort for DAG mode
  let ordered: FlightSpec[];
  if (isDAG) {
    ordered = topologicalSort(pipelineFlights);
  } else {
    ordered = pipelineFlights;
  }

  const flightOrder: DryRunFlight[] = ordered.map((f, i) => {
    let resolvedPreview: string;
    try {
      resolvedPreview = resolveNectar(f.input, nectar);
    } catch {
      resolvedPreview = f.input;
    }

    return {
      id: f.id,
      bee: f.bee,
      type: f.type,
      order: i + 1,
      depends_on: f.depends_on,
      when: f.when,
      gate: f.gate ? serializeGateSpec(f.gate) : undefined,
      produces: f.produces,
      requires: f.requires,
      resolved_input_preview: resolvedPreview,
      expects: f.expects,
      would_skip: false, // Can't determine without nectar values
    };
  });

  // Compute nectar flow info
  const availableKeys = new Set<string>(["task", "swarm_id", "progress"]);
  if (spec.nectar) {
    for (const key of Object.keys(spec.nectar)) availableKeys.add(key);
  }
  if (spec.inputs) {
    for (const input of spec.inputs) availableKeys.add(input.name);
  }
  const producedKeys = new Set<string>();
  for (const f of ordered) {
    if (f.produces) {
      for (const key of f.produces) {
        producedKeys.add(key);
        availableKeys.add(key);
      }
    }
  }

  return {
    success: true,
    data: {
      blueprint_id: blueprintId,
      mode: isDAG ? "dag" : "sequential",
      flight_order: flightOrder,
      total_flights: flightOrder.length,
      gated_flights: flightOrder.filter(f => f.gate).length,
      conditional_flights: flightOrder.filter(f => f.when).length,
      nectar_flow: {
        available_keys: Array.from(availableKeys),
        produced_keys: Array.from(producedKeys),
      },
    },
  };
}

function topologicalSort(flights: FlightSpec[]): FlightSpec[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const flightMap = new Map<string, FlightSpec>();

  for (const f of flights) {
    inDegree.set(f.id, 0);
    adj.set(f.id, []);
    flightMap.set(f.id, f);
  }

  for (const f of flights) {
    if (f.depends_on) {
      for (const dep of f.depends_on) {
        if (adj.has(dep)) {
          adj.get(dep)!.push(f.id);
          inDegree.set(f.id, (inDegree.get(f.id) ?? 0) + 1);
        }
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: FlightSpec[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(flightMap.get(node)!);
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result;
}
