import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { nowUtc } from "../lib/time.js";
import { advancePipeline } from "../pipeline/advance.js";
import { updateBeeStats } from "../usage/bee-stats.js";
import { insertTrace } from "../trace/record.js";
import { logger } from "../lib/logger.js";
import type { DeadLetterRecord } from "../types.js";

/**
 * Move a flight to the dead letter queue instead of failing the swarm.
 * The flight is marked as "dead_letter" and the swarm continues with independent flights.
 */
export function deadLetterFlight(
  flightUuid: string,
  error: string,
  context?: string,
): { success: true; message: string } {
  const flight = db.getFlight(flightUuid);
  if (!flight) {
    return { success: true, message: "Flight not found for DLQ" };
  }

  const now = nowUtc();

  // Update flight status to dead_letter
  db.updateFlight(flightUuid, {
    status: "dead_letter",
    output: error,
    completed_at: now,
    error_context: context ?? null,
  });

  // Insert dead letter record
  db.insertDeadLetter(
    flightUuid,
    flight.swarm_id,
    flight.flight_id,
    flight.bee_id,
    error,
    flight.retry_count,
    context,
  );

  db.bumpEpoch();
  db.deletePulsesForFlight(flightUuid);

  // Track usage and bee stats
  const durationSec = db.getFlightElapsed(flightUuid) ?? 0;
  const usage = db.getUsageForFlight(flightUuid);
  const tokens = usage ? usage.input_tokens + usage.output_tokens : 0;
  updateBeeStats(flight.bee_id, false, durationSec, tokens);

  insertTrace(flightUuid, flight.swarm_id, "error", {
    error,
    context: context ?? null,
    dead_lettered: true,
    retry_count: flight.retry_count,
  });

  emitEvent({
    eventType: "flight.dead_lettered",
    swarmId: flight.swarm_id,
    payload: {
      flight_id: flight.flight_id,
      flight_uuid: flightUuid,
      error,
    },
  });

  // Try to advance the pipeline — the swarm continues with other flights
  advancePipeline(flight.swarm_id);

  logger.info("Flight dead-lettered", { flightId: flight.flight_id, swarmId: flight.swarm_id });
  return {
    success: true,
    message: `Flight "${flight.flight_id}" moved to dead letter queue. Swarm continues.`,
  };
}

/**
 * List dead letters with optional filters.
 */
export function listDeadLettersQuery(filters?: { swarm_id?: string; status?: string }): DeadLetterRecord[] {
  return db.listDeadLetters(filters);
}

/**
 * Replay a dead-lettered flight: reset it to pending and mark the DL as replayed.
 */
export function replayDeadLetter(deadLetterId: string): { success: boolean; message?: string; error?: string } {
  const dl = db.getDeadLetter(deadLetterId);
  if (!dl) {
    return { success: false, error: `Dead letter "${deadLetterId}" not found` };
  }
  if (dl.status !== "pending") {
    return { success: false, error: `Dead letter is already "${dl.status}"` };
  }

  const flight = db.getFlight(dl.flight_uuid);
  if (!flight) {
    return { success: false, error: `Flight "${dl.flight_uuid}" not found` };
  }

  // Reset flight to pending
  db.updateFlight(dl.flight_uuid, {
    status: "pending",
    output: null,
    retry_count: 0,
    completed_at: null,
    error_context: null,
  });

  // Mark dead letter as replayed
  db.updateDeadLetter(deadLetterId, {
    status: "replayed",
    replayed_at: nowUtc(),
  });

  db.bumpEpoch();

  emitEvent({
    eventType: "dlq.replayed",
    swarmId: dl.swarm_id,
    payload: { dead_letter_id: deadLetterId, flight_id: dl.flight_id },
  });

  // Advance pipeline to pick up the replayed flight
  advancePipeline(dl.swarm_id);

  logger.info("Dead letter replayed", { deadLetterId, flightId: dl.flight_id });
  return { success: true, message: `Dead letter replayed — flight "${dl.flight_id}" reset to pending` };
}

/**
 * Purge dead letters (mark as purged).
 */
export function purgeDeadLetters(params: { dead_letter_id?: string; swarm_id?: string }): { success: boolean; purged: number; error?: string } {
  if (params.dead_letter_id) {
    const dl = db.getDeadLetter(params.dead_letter_id);
    if (!dl) {
      return { success: false, purged: 0, error: `Dead letter "${params.dead_letter_id}" not found` };
    }
    db.updateDeadLetter(params.dead_letter_id, { status: "purged" });
    emitEvent({
      eventType: "dlq.purged",
      swarmId: dl.swarm_id,
      payload: { dead_letter_id: params.dead_letter_id },
    });
    return { success: true, purged: 1 };
  }

  if (params.swarm_id) {
    const dls = db.listDeadLetters({ swarm_id: params.swarm_id, status: "pending" });
    for (const dl of dls) {
      db.updateDeadLetter(dl.id, { status: "purged" });
    }
    if (dls.length > 0) {
      emitEvent({
        eventType: "dlq.purged",
        swarmId: params.swarm_id,
        payload: { count: dls.length },
      });
    }
    return { success: true, purged: dls.length };
  }

  return { success: false, purged: 0, error: "Provide dead_letter_id or swarm_id" };
}
