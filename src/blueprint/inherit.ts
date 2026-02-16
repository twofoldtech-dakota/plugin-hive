import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { logger } from "../lib/logger.js";
import type { BlueprintSpec, BeeSpec, FlightSpec } from "../types.js";

const MAX_DEPTH = 5;

export type InheritResult =
  | { success: true; spec: BlueprintSpec; chain: string[] }
  | { success: false; error: string };

/**
 * Resolve blueprint inheritance chain.
 * Child overrides are merged by matching on `id` field — matching IDs merge
 * fields (child wins), new IDs are appended.
 * Top-level fields are replaced if present in child.
 */
export function resolveInheritance(spec: BlueprintSpec, depth: number = 0, visited: Set<string> = new Set()): InheritResult {
  if (!spec.extends) {
    return { success: true, spec, chain: [spec.id] };
  }

  if (depth >= MAX_DEPTH) {
    return { success: false, error: `Blueprint inheritance depth exceeds maximum of ${MAX_DEPTH}` };
  }

  if (visited.has(spec.id)) {
    return { success: false, error: `Circular inheritance detected: ${[...visited, spec.id].join(" -> ")}` };
  }
  visited.add(spec.id);

  // Load parent blueprint from DB
  const parentBp = db.getBlueprint(spec.extends);
  if (!parentBp) {
    return { success: false, error: `Parent blueprint "${spec.extends}" is not installed` };
  }

  const parentSpec = safeJsonParse<BlueprintSpec | null>(parentBp.spec, null);
  if (!parentSpec) {
    return { success: false, error: `Parent blueprint "${spec.extends}" has invalid spec` };
  }

  // Recursively resolve parent
  const parentResult = resolveInheritance(parentSpec, depth + 1, visited);
  if (!parentResult.success) {
    return parentResult;
  }

  const resolvedParent = parentResult.spec;

  // Merge bees
  const mergedBees = mergeBees(resolvedParent.bees, spec.bees ?? []);

  // Merge flights
  const mergedFlights = mergeFlights(resolvedParent.flights, spec.flights ?? []);

  // Merge top-level fields (child wins if present)
  const merged: BlueprintSpec = {
    ...resolvedParent,
    id: spec.id,
    name: spec.name ?? resolvedParent.name,
    version: spec.version ?? resolvedParent.version,
    description: spec.description ?? resolvedParent.description,
    bees: mergedBees,
    flights: mergedFlights,
  };

  // Replace top-level config sections if child defines them
  if (spec.polling !== undefined) merged.polling = spec.polling;
  if (spec.nectar !== undefined) merged.nectar = spec.nectar;
  if (spec.notifications !== undefined) merged.notifications = spec.notifications;
  if (spec.inputs !== undefined) merged.inputs = spec.inputs;
  if (spec.beekeeper !== undefined) merged.beekeeper = spec.beekeeper;
  if (spec.triggers !== undefined) merged.triggers = spec.triggers;

  // Remove extends from resolved spec
  delete merged.extends;

  const chain = [...parentResult.chain, spec.id];
  logger.info("Blueprint inheritance resolved", { id: spec.id, extends: spec.extends, chain });

  return { success: true, spec: merged, chain };
}

/**
 * Merge bees: matching IDs merge fields (child wins), new IDs append.
 */
function mergeBees(parentBees: BeeSpec[], childBees: BeeSpec[]): BeeSpec[] {
  const result = [...parentBees.map(b => ({ ...b }))];
  const indexMap = new Map(result.map((b, i) => [b.id, i]));

  for (const childBee of childBees) {
    const existingIndex = indexMap.get(childBee.id);
    if (existingIndex !== undefined) {
      // Merge: child fields override parent
      result[existingIndex] = { ...result[existingIndex], ...childBee };
    } else {
      result.push({ ...childBee });
    }
  }

  return result;
}

/**
 * Merge flights: matching IDs merge fields (child wins), new IDs append.
 * Special handling: `gate: null` in child removes the gate.
 */
function mergeFlights(parentFlights: FlightSpec[], childFlights: FlightSpec[]): FlightSpec[] {
  const result = [...parentFlights.map(f => ({ ...f }))];
  const indexMap = new Map(result.map((f, i) => [f.id, i]));

  for (const childFlight of childFlights) {
    const existingIndex = indexMap.get(childFlight.id);
    if (existingIndex !== undefined) {
      const merged = { ...result[existingIndex], ...childFlight };
      // Handle null gate removal
      const raw = childFlight as unknown as Record<string, unknown>;
      if (raw.gate === null) {
        delete (merged as unknown as Record<string, unknown>).gate;
      }
      result[existingIndex] = merged;
    } else {
      result.push({ ...childFlight });
    }
  }

  return result;
}
