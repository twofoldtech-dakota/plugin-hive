import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { nowUtc } from "../lib/time.js";
import { getConfigBoolean, getConfigNumber } from "../config/global.js";
import type { CircuitBreakerRecord, CircuitState } from "../types.js";

/**
 * Check if a circuit breaker allows a flight claim for the given bee.
 * Bee IDs are qualified as `{blueprint_id}/{bee_id}` to scope per-blueprint.
 * Returns true if claim is allowed, false if blocked by open circuit.
 */
export function circuitAllowsClaim(beeId: string): boolean {
  if (!getConfigBoolean("circuit_breaker_enabled", false)) return true;

  const circuit = db.getCircuitBreaker(beeId);
  if (!circuit) return true; // No circuit = closed = allow

  if (circuit.state === "closed") return true;
  if (circuit.state === "open") return false;

  // half_open: allow exactly one probe (will be validated on success/failure)
  return true;
}

/**
 * Record a successful flight completion for circuit breaker tracking.
 * Transitions half_open -> closed on success.
 */
export function recordCircuitSuccess(beeId: string): void {
  if (!getConfigBoolean("circuit_breaker_enabled", false)) return;

  const circuit = db.getCircuitBreaker(beeId);
  if (!circuit) return;

  if (circuit.state === "half_open") {
    // Success in half-open: close the circuit
    db.upsertCircuitBreaker(beeId, {
      state: "closed",
      failure_count: 0,
      success_count: circuit.success_count + 1,
      opened_at: null,
      half_open_at: null,
    });
    emitEvent({
      eventType: "circuit.closed",
      payload: { bee_id: beeId, reason: "half_open_success" },
    });
  } else if (circuit.state === "closed") {
    // Track success count
    db.upsertCircuitBreaker(beeId, {
      success_count: circuit.success_count + 1,
    });
  }
}

/**
 * Record a flight failure for circuit breaker tracking.
 * If failures >= threshold, transitions closed -> open.
 */
export function recordCircuitFailure(beeId: string): void {
  if (!getConfigBoolean("circuit_breaker_enabled", false)) return;

  const threshold = getConfigNumber("circuit_breaker_threshold", 5);
  const timeoutMinutes = getConfigNumber("circuit_breaker_timeout_minutes", 10);
  const now = nowUtc();

  const circuit = db.getCircuitBreaker(beeId);
  const newFailureCount = (circuit?.failure_count ?? 0) + 1;

  if (circuit?.state === "half_open") {
    // Failure in half-open: reopen the circuit
    db.upsertCircuitBreaker(beeId, {
      state: "open",
      failure_count: newFailureCount,
      last_failure_at: now,
      opened_at: now,
      half_open_at: null,
      threshold,
      timeout_minutes: timeoutMinutes,
    });
    emitEvent({
      eventType: "circuit.opened",
      payload: { bee_id: beeId, failure_count: newFailureCount, reason: "half_open_failure" },
    });
    return;
  }

  if (newFailureCount >= threshold) {
    // Trip the circuit open
    db.upsertCircuitBreaker(beeId, {
      state: "open",
      failure_count: newFailureCount,
      last_failure_at: now,
      opened_at: now,
      half_open_at: null,
      threshold,
      timeout_minutes: timeoutMinutes,
    });
    emitEvent({
      eventType: "circuit.opened",
      payload: { bee_id: beeId, failure_count: newFailureCount, threshold },
    });
  } else {
    // Increment failure count, stay closed
    db.upsertCircuitBreaker(beeId, {
      failure_count: newFailureCount,
      last_failure_at: now,
      threshold,
      timeout_minutes: timeoutMinutes,
    });
  }
}

/**
 * Transition expired open circuits to half_open.
 * Returns the number of circuits transitioned.
 */
export function transitionExpiredCircuits(): number {
  const timeoutMinutes = getConfigNumber("circuit_breaker_timeout_minutes", 10);
  const expired = db.getExpiredOpenCircuits(timeoutMinutes);
  const now = nowUtc();
  let count = 0;

  for (const circuit of expired) {
    db.upsertCircuitBreaker(circuit.bee_id, {
      state: "half_open",
      half_open_at: now,
    });
    emitEvent({
      eventType: "circuit.half_open",
      payload: { bee_id: circuit.bee_id, opened_duration_minutes: timeoutMinutes },
    });
    count++;
  }

  return count;
}

/**
 * List all circuit breakers, optionally filtered by state.
 */
export function listCircuits(state?: CircuitState): CircuitBreakerRecord[] {
  return db.listCircuitBreakers(state);
}

/**
 * Manually reset a circuit breaker to closed.
 */
export function resetCircuit(beeId: string): { success: boolean; error?: string } {
  const circuit = db.getCircuitBreaker(beeId);
  if (!circuit) {
    return { success: false, error: `No circuit breaker found for bee "${beeId}"` };
  }

  db.upsertCircuitBreaker(beeId, {
    state: "closed",
    failure_count: 0,
    opened_at: null,
    half_open_at: null,
  });

  emitEvent({
    eventType: "circuit.closed",
    payload: { bee_id: beeId, reason: "manual_reset" },
  });

  return { success: true };
}
