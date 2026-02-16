import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { safeJsonParse } from "../lib/json.js";
import type { NectarSetResult, NectarGetResult } from "../types.js";

/**
 * Set or override a single nectar key on a swarm.
 * Bumps epoch and emits nectar.injected event.
 */
export function setNectarKey(swarmId: string, key: string, value: string): { success: true; result: NectarSetResult } | { success: false; error: string } {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm not found: ${swarmId}` };
  }

  const nectar = safeJsonParse<Record<string, string>>(swarm.nectar, {});
  const oldValue = nectar[key] ?? null;
  nectar[key] = value;

  db.updateSwarm(swarmId, { nectar: JSON.stringify(nectar) });
  const epoch = db.bumpEpoch();

  emitEvent({
    eventType: "nectar.injected",
    swarmId,
    payload: { key, value, old_value: oldValue },
  });

  return {
    success: true,
    result: {
      swarm_id: swarmId,
      key,
      value,
      old_value: oldValue,
      epoch,
    },
  };
}

/**
 * Get nectar for a swarm — all keys or a single key.
 */
export function getNectar(swarmId: string, key?: string): { success: true; result: NectarGetResult } | { success: false; error: string } {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm not found: ${swarmId}` };
  }

  const nectar = safeJsonParse<Record<string, string>>(swarm.nectar, {});

  if (key) {
    return {
      success: true,
      result: {
        swarm_id: swarmId,
        nectar,
        key,
        value: nectar[key],
      },
    };
  }

  return {
    success: true,
    result: {
      swarm_id: swarmId,
      nectar,
    },
  };
}
