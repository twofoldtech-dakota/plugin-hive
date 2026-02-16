import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import type { FailoverStep, FlightRecord } from "../types.js";

/**
 * Resolve failover chain for a flight on retry.
 * Returns the failover step to apply (model/bee override), or null if no failover available.
 */
export function resolveFailover(flight: FlightRecord): FailoverStep | null {
  if (!flight.failover_config) return null;

  const steps = safeJsonParse<FailoverStep[]>(flight.failover_config, []);
  if (steps.length === 0) return null;

  // Use retry_count as failover index (0-based: first retry → first failover step)
  const stepIndex = flight.retry_count;
  if (stepIndex >= steps.length) return null;

  return steps[stepIndex];
}

/**
 * Apply a failover step to a flight: set model_override and optionally change bee_id.
 * Called from fail.ts when a flight is being retried and has failover config.
 */
export function applyFailover(flightUuid: string, swarmId: string, step: FailoverStep, currentBeeId: string): void {
  if (step.model) {
    db.setFlightModelOverride(flightUuid, step.model, currentBeeId);
  }

  emitEvent({
    eventType: "flight.failover",
    swarmId,
    payload: {
      flight_id: flightUuid,
      failover_model: step.model ?? null,
      failover_bee: step.bee ?? null,
    },
  });

  logger.info("Flight failover applied", {
    flightId: flightUuid,
    model: step.model,
    bee: step.bee,
  });
}
