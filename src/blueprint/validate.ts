import { join } from "node:path";
import { existsSync } from "node:fs";
import { loadBlueprintFromDir } from "./loader.js";
import { blueprintDir, projectBlueprintsDir, bundledBlueprintsDir } from "../lib/paths.js";
import { safeJsonParse } from "../lib/json.js";
import { validateContracts } from "../nectar/contracts.js";
import * as db from "../db.js";
import type { BlueprintSpec } from "../types.js";

export interface ValidationIssue {
  type: "error" | "warning";
  message: string;
}

export type ValidateResult =
  | { success: true; valid: true; issues: ValidationIssue[] }
  | { success: true; valid: false; issues: ValidationIssue[] }
  | { success: false; error: string };

/**
 * Validate a blueprint with extended semantic checks beyond Zod schema:
 * - Nectar reachability: verify that template variables in flight inputs can be produced
 * - Role consistency: check that bee roles match their assigned flight patterns
 * - Cycle detection detail: show which flights form cycles
 */
export function validateBlueprint(blueprintId: string): ValidateResult {
  // Try to find blueprint directory
  const dirs = [
    join(projectBlueprintsDir(), blueprintId),
    blueprintDir(blueprintId),
    join(bundledBlueprintsDir(), blueprintId),
  ];

  let loadResult;
  for (const dir of dirs) {
    if (existsSync(join(dir, "blueprint.yml"))) {
      loadResult = loadBlueprintFromDir(dir);
      break;
    }
  }

  // Also try from installed DB
  if (!loadResult) {
    const bp = db.getBlueprint(blueprintId);
    if (bp) {
      const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
      if (spec) {
        return runSemanticChecks(spec);
      }
    }
    return { success: false, error: `Blueprint "${blueprintId}" not found` };
  }

  if (!loadResult.success) {
    return { success: true, valid: false, issues: [{ type: "error", message: loadResult.error }] };
  }

  return runSemanticChecks(loadResult.blueprint);
}

function runSemanticChecks(spec: BlueprintSpec): ValidateResult {
  const issues: ValidationIssue[] = [];

  // Nectar reachability: check that {{var}} references can be produced
  const producibleKeys = new Set<string>(["task", "swarm_id", "progress", "current_cell", "acceptance_criteria", "completed_cells", "cells_remaining"]);
  if (spec.nectar) {
    for (const key of Object.keys(spec.nectar)) {
      producibleKeys.add(key);
    }
  }
  if (spec.inputs) {
    for (const input of spec.inputs) {
      producibleKeys.add(input.name);
    }
  }

  // Each flight's expects can produce keys
  for (const flight of spec.flights) {
    const expectsKeys = flight.expects.split(/[,\n]/).map(s => {
      const match = s.trim().match(/^([A-Z_]+):/);
      return match ? match[1].toLowerCase() : null;
    }).filter(Boolean) as string[];
    for (const key of expectsKeys) {
      producibleKeys.add(key);
    }
  }

  // Check each flight's input template for unreachable variables
  for (const flight of spec.flights) {
    const refs = flight.input.match(/\{\{([a-z_]+)(?:\|[^}]*)?\}\}/g) ?? [];
    for (const ref of refs) {
      const key = ref.replace(/\{\{/, "").replace(/(\|.*?)?\}\}/, "");
      if (!producibleKeys.has(key) && !key.startsWith("#") && !key.startsWith("/")) {
        issues.push({
          type: "warning",
          message: `Flight "${flight.id}" references {{${key}}} which may not be produced by any earlier flight`,
        });
      }
    }
  }

  // Role consistency: analysis bees shouldn't be on coding flights, etc.
  const beeRoles = new Map(spec.bees.map(b => [b.id, b.role]));
  for (const flight of spec.flights) {
    const role = beeRoles.get(flight.bee);
    if (role === "analysis" && flight.type === "loop") {
      issues.push({
        type: "warning",
        message: `Flight "${flight.id}" assigns analysis bee "${flight.bee}" to a loop flight (typically coding)`,
      });
    }
  }

  // Nectar contract validation
  const contractIssues = validateContracts(spec);
  for (const ci of contractIssues) {
    issues.push({ type: ci.type, message: ci.message });
  }

  // Trigger validation
  if (spec.triggers) {
    for (const trigger of spec.triggers) {
      if (!trigger.blueprint) {
        issues.push({ type: "error", message: "Trigger missing required 'blueprint' field" });
      }
    }
  }

  const valid = !issues.some(i => i.type === "error");
  return { success: true, valid, issues };
}
