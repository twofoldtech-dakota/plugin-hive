import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { logger } from "../lib/logger.js";
import type { BlueprintSpec } from "../types.js";

const SYSTEM_KEYS = new Set([
  "task", "swarm_id", "progress", "current_cell", "acceptance_criteria",
  "completed_cells", "cells_remaining", "inspect_feedback",
]);

// Keys matching verify_cell_* pattern
function isSystemKey(key: string): boolean {
  return SYSTEM_KEYS.has(key) || key.startsWith("verify_cell_");
}

export interface ContractIssue {
  type: "error" | "warning";
  flight_id: string;
  message: string;
}

/**
 * Walk pipeline in order and check every `requires` key has a producer
 * in prior flight's `produces`, `spec.nectar`, `spec.inputs`, or system keys.
 */
export function validateContracts(spec: BlueprintSpec): ContractIssue[] {
  const issues: ContractIssue[] = [];

  // Build set of available keys
  const available = new Set<string>(SYSTEM_KEYS);

  // Add nectar keys
  if (spec.nectar) {
    for (const key of Object.keys(spec.nectar)) {
      available.add(key);
    }
  }

  // Add input keys
  if (spec.inputs) {
    for (const input of spec.inputs) {
      available.add(input.name);
    }
  }

  // Walk flights in order
  for (const flight of spec.flights) {
    // Check requires
    if (flight.requires) {
      for (const key of flight.requires) {
        if (!available.has(key) && !isSystemKey(key)) {
          issues.push({
            type: "warning",
            flight_id: flight.id,
            message: `Flight "${flight.id}" requires key "${key}" which is not produced by any prior flight or declared in nectar/inputs`,
          });
        }
      }
    }

    // Add produces to available
    if (flight.produces) {
      for (const key of flight.produces) {
        available.add(key);
      }
    }
  }

  return issues;
}

/**
 * At flight completion time, warn if declared `produces` keys are missing from nectar.
 * Non-blocking — logs warnings only.
 */
export function checkProducedKeys(
  flightId: string,
  swarmId: string,
  declaredProduces: string[],
  currentNectar: Record<string, string>,
): string[] {
  const missing: string[] = [];
  for (const key of declaredProduces) {
    if (!(key in currentNectar)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    logger.warn("Nectar contract: flight missing declared produces keys", {
      flightId,
      swarmId,
      missing,
    });
  }

  return missing;
}

/**
 * Get contract info for a flight from the database.
 */
export function getFlightContracts(flightUuid: string): { produces: string[]; requires: string[] } {
  const flight = db.getFlight(flightUuid);
  if (!flight) return { produces: [], requires: [] };
  return {
    produces: flight.produces ? safeJsonParse<string[]>(flight.produces, []) : [],
    requires: flight.requires ? safeJsonParse<string[]>(flight.requires, []) : [],
  };
}
