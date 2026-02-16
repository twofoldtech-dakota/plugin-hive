import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import { evaluateWhen } from "../flight/when.js";
import { createSwarmFromBlueprint } from "../swarm/create.js";
import type { BlueprintSpec } from "../types.js";

/**
 * Check and fire triggers after a swarm completes or fails.
 */
export function checkAndFireTriggers(
  swarmId: string,
  eventType: "swarm.completed" | "swarm.failed",
): void {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) return;

  const bp = db.getBlueprint(swarm.blueprint_id);
  if (!bp) return;

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec?.triggers || spec.triggers.length === 0) return;

  const nectar = safeJsonParse<Record<string, string>>(swarm.nectar, {});
  nectar.status = eventType === "swarm.completed" ? "pass" : "fail";

  for (const trigger of spec.triggers) {
    if (trigger.on !== eventType) continue;

    // Evaluate optional condition
    if (trigger.condition) {
      if (!evaluateWhen(trigger.condition, nectar)) {
        logger.info("Trigger condition not met", { swarmId, trigger: trigger.blueprint, condition: trigger.condition });
        continue;
      }
    }

    // Forward specified nectar keys
    const forwardedNectar: Record<string, string> = {};
    if (trigger.nectar_forward) {
      for (const key of trigger.nectar_forward) {
        if (nectar[key] !== undefined) {
          forwardedNectar[key] = nectar[key];
        }
      }
    }

    // Merge with trigger variables
    const variables: Record<string, string> = {
      ...forwardedNectar,
      ...(trigger.variables ?? {}),
    };

    // Resolve task template
    let task = trigger.task_template ?? `Triggered by ${swarm.blueprint_id} swarm`;
    for (const [key, value] of Object.entries(nectar)) {
      task = task.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    // Determine or create chain
    let chainId = swarm.chain_id;
    if (!chainId) {
      const chain = db.insertChain(swarmId, `${swarm.blueprint_id} chain`);
      chainId = chain.id;
      emitEvent({ eventType: "chain.created", swarmId, payload: { chain_id: chainId } });
    }

    // Check that target blueprint is installed
    const targetBp = db.getBlueprint(trigger.blueprint);
    if (!targetBp) {
      logger.warn("Trigger target blueprint not installed", { blueprint: trigger.blueprint });
      continue;
    }

    // Create child swarm
    const result = createSwarmFromBlueprint(
      trigger.blueprint,
      task,
      variables,
      chainId,
      swarmId,
    );

    if (result.success) {
      emitEvent({
        eventType: "swarm.triggered",
        swarmId: result.data.id,
        payload: {
          parent_swarm_id: swarmId,
          chain_id: chainId,
          trigger_blueprint: trigger.blueprint,
        },
      });
      logger.info("Trigger fired", {
        parentSwarmId: swarmId,
        childSwarmId: result.data.id,
        blueprint: trigger.blueprint,
      });
    } else {
      logger.error("Trigger failed to create swarm", {
        parentSwarmId: swarmId,
        blueprint: trigger.blueprint,
        error: result.error,
      });
    }
  }
}
