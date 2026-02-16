import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import type { BlueprintSpec, InputSpec } from "../types.js";

export interface BlueprintInfo {
  id: string;
  name?: string;
  version?: number;
  description?: string;
  bees: Array<{ id: string; name?: string; role: string }>;
  flights: Array<{ id: string; bee: string; type: string; when?: string; gate?: string }>;
  inputs?: InputSpec[];
  beekeeper?: BlueprintSpec["beekeeper"];
}

export type GetBlueprintInfoResult =
  | { success: true; data: BlueprintInfo }
  | { success: false; error: string };

/**
 * Get detailed blueprint information including input schema.
 */
export function getBlueprintInfo(blueprintId: string): GetBlueprintInfoResult {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" is not installed` };
  }

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) {
    return { success: false, error: `Blueprint "${blueprintId}" has invalid spec` };
  }

  return {
    success: true,
    data: {
      id: spec.id,
      name: spec.name,
      version: spec.version,
      description: spec.description,
      bees: spec.bees.map(b => ({ id: b.id, name: b.name, role: b.role })),
      flights: spec.flights.map(f => ({
        id: f.id,
        bee: f.bee,
        type: f.type,
        when: f.when,
        gate: f.gate,
      })),
      inputs: spec.inputs,
      beekeeper: spec.beekeeper,
    },
  };
}

/**
 * Validate input variables against blueprint's input schema.
 * Returns merged variables (with defaults applied) or an error.
 */
export function validateInputs(
  spec: BlueprintSpec,
  variables?: Record<string, string>,
): { valid: true; merged: Record<string, string> } | { valid: false; error: string } {
  if (!spec.inputs || spec.inputs.length === 0) {
    return { valid: true, merged: variables ?? {} };
  }

  const merged: Record<string, string> = { ...(variables ?? {}) };
  const missing: string[] = [];

  for (const input of spec.inputs) {
    if (merged[input.name] === undefined) {
      if (input.default !== undefined) {
        merged[input.name] = input.default;
      } else if (input.required) {
        missing.push(input.name);
      }
    }
  }

  if (missing.length > 0) {
    return { valid: false, error: `Missing required input(s): ${missing.join(", ")}` };
  }

  return { valid: true, merged };
}
