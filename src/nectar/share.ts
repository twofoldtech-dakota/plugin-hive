import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import type { NectarRef, NectarShareRecord } from "../types.js";

/**
 * Resolve nectar refs for a flight at claim time.
 * Imports nectar values from other swarms into the current swarm's nectar.
 */
export function resolveNectarRefs(
  swarmId: string,
  flightUuid: string,
  flightId: string,
  nectarRefsJson: string,
  currentNectar: Record<string, string>,
): { success: true; resolved: Record<string, string> } | { success: false; error: string } {
  const refs = safeJsonParse<NectarRef[]>(nectarRefsJson, []);
  if (refs.length === 0) return { success: true, resolved: {} };

  const resolved: Record<string, string> = {};

  for (const ref of refs) {
    const sourceSwarmId = resolveSourceSwarm(ref.from_swarm, currentNectar);
    if (!sourceSwarmId) {
      if (ref.required !== false) {
        return { success: false, error: `Cannot resolve source swarm for nectar ref "${ref.key}" (from_swarm: ${ref.from_swarm})` };
      }
      continue;
    }

    const sourceSwarm = db.getSwarm(sourceSwarmId);
    if (!sourceSwarm) {
      if (ref.required !== false) {
        return { success: false, error: `Source swarm "${sourceSwarmId}" not found for nectar ref "${ref.key}"` };
      }
      continue;
    }

    const sourceNectar = safeJsonParse<Record<string, string>>(sourceSwarm.nectar, {});
    const value = sourceNectar[ref.from_key];

    if (value === undefined) {
      if (ref.required !== false) {
        return { success: false, error: `Key "${ref.from_key}" not found in source swarm "${sourceSwarmId}" nectar` };
      }
      continue;
    }

    resolved[ref.key] = value;

    // Record the share
    const share = db.insertNectarShare(swarmId, flightId, sourceSwarmId, ref.key, ref.from_key);
    db.resolveNectarShare(share.id, value);

    emitEvent({
      eventType: "nectar.shared",
      swarmId,
      payload: {
        flight_id: flightId,
        source_swarm_id: sourceSwarmId,
        key: ref.key,
        from_key: ref.from_key,
      },
    });
  }

  logger.info("Nectar refs resolved", { swarmId, flightId, keys: Object.keys(resolved) });
  return { success: true, resolved };
}

/**
 * Resolve a source swarm reference.
 * Supports: direct UUID, "latest:<blueprint_id>", or {{nectar_var}} template.
 */
function resolveSourceSwarm(
  fromSwarm: string,
  nectar: Record<string, string>,
): string | undefined {
  // latest:<blueprint_id> — find most recently completed swarm for that blueprint
  if (fromSwarm.startsWith("latest:")) {
    const blueprintId = fromSwarm.slice(7);
    const latest = db.getLatestCompletedSwarmForBlueprint(blueprintId);
    return latest?.id;
  }

  // {{var}} template — resolve from current nectar
  const templateMatch = fromSwarm.match(/^\{\{(\w+)\}\}$/);
  if (templateMatch) {
    return nectar[templateMatch[1]];
  }

  // Direct swarm ID
  return fromSwarm;
}

/**
 * Get nectar shares for a swarm.
 */
export function getNectarShares(swarmId: string): NectarShareRecord[] {
  return db.getNectarSharesForSwarm(swarmId);
}

/**
 * Manually resolve a nectar ref by looking up a specific key from a source swarm.
 */
export function manualResolve(
  sourceSwarmId: string,
  fromKey: string,
): { success: true; value: string } | { success: false; error: string } {
  const sourceSwarm = db.getSwarm(sourceSwarmId);
  if (!sourceSwarm) {
    return { success: false, error: `Source swarm "${sourceSwarmId}" not found` };
  }

  const nectar = safeJsonParse<Record<string, string>>(sourceSwarm.nectar, {});
  const value = nectar[fromKey];
  if (value === undefined) {
    return { success: false, error: `Key "${fromKey}" not found in swarm nectar` };
  }

  return { success: true, value };
}
