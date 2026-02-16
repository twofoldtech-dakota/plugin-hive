import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import type { ModelRoutingConfig, ModelTier, FlightRecord, BeeSpec } from "../types.js";

/**
 * Select a model based on bee routing config and flight context.
 * Falls back to bee.model or blueprint default if no routing config.
 */
export function selectModel(
  beeSpec: BeeSpec,
  flight: FlightRecord,
  swarmId: string,
  defaultModel: string,
): { model: string; tier: ModelTier; reason: string } {
  const routingConfig = (beeSpec as BeeSpec & { model_routing?: ModelRoutingConfig }).model_routing;

  // Check for model_override from failover
  if (flight.model_override) {
    return {
      model: flight.model_override,
      tier: "balanced",
      reason: "failover_override",
    };
  }

  if (!routingConfig) {
    const model = beeSpec.model ?? defaultModel;
    return { model, tier: "balanced", reason: "default" };
  }

  // Evaluate rules in order
  let selectedTier = routingConfig.default_tier;
  let reason = "default_tier";

  if (routingConfig.rules) {
    for (const rule of routingConfig.rules) {
      if (evaluateRoutingCondition(rule.condition, flight)) {
        selectedTier = rule.tier;
        reason = `rule: ${rule.condition}`;
        break;
      }
    }
  }

  const model = routingConfig.tiers[selectedTier] ?? beeSpec.model ?? defaultModel;

  // Log routing decision
  db.insertModelRoutingLog(
    flight.id,
    swarmId,
    beeSpec.id,
    selectedTier,
    model,
    reason,
  );

  emitEvent({
    eventType: "flight.model_routed",
    swarmId,
    payload: {
      flight_id: flight.flight_id,
      bee_id: beeSpec.id,
      tier: selectedTier,
      model,
      reason,
    },
  });

  logger.info("Model routed", {
    beeId: beeSpec.id,
    tier: selectedTier,
    model,
    reason,
  });

  return { model, tier: selectedTier, reason };
}

/**
 * Evaluate a simple routing condition against flight context.
 * Supports: "retry_count > N", "type == loop", "type == single"
 */
function evaluateRoutingCondition(condition: string, flight: FlightRecord): boolean {
  const retryMatch = condition.match(/^retry_count\s*([><=!]+)\s*(\d+)$/);
  if (retryMatch) {
    const op = retryMatch[1];
    const value = parseInt(retryMatch[2], 10);
    switch (op) {
      case ">": return flight.retry_count > value;
      case ">=": return flight.retry_count >= value;
      case "<": return flight.retry_count < value;
      case "<=": return flight.retry_count <= value;
      case "==": return flight.retry_count === value;
      case "!=": return flight.retry_count !== value;
    }
  }

  const typeMatch = condition.match(/^type\s*==\s*(\w+)$/);
  if (typeMatch) {
    return flight.type === typeMatch[1];
  }

  return false;
}

/**
 * Get routing history for a swarm or globally.
 */
export function getRoutingHistory(swarmId?: string, limit: number = 50) {
  return db.getModelRoutingHistory(swarmId, limit);
}
