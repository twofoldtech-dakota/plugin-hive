import { appendFileSync } from "node:fs";
import * as db from "../db.js";
import { eventsPath, ensureDataDir } from "./paths.js";
import { logger } from "./logger.js";
import { processEventForWebhook } from "../notification/webhook.js";
import type { HiveEventType, EventRecord } from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface EmitEventOptions {
  eventType: HiveEventType;
  swarmId?: string;
  payload?: Record<string, unknown>;
}

export type EventEmitResult =
  | { success: true; event: EventRecord }
  | { success: false; error: string };

// ── Core ──────────────────────────────────────────────────────────────

/**
 * Emit a hive event:
 *  1. Insert into the database
 *  2. Append to events.jsonl for Observatory streaming
 *  3. Process webhook delivery via notification system
 */
export function emitEvent(opts: EmitEventOptions): EventEmitResult {
  const { eventType, swarmId, payload } = opts;

  try {
    // 1. Database
    const event = db.insertEvent(eventType, swarmId, payload);

    // 2. JSONL log
    writeJsonl(event);

    // 3. Webhook delivery system (creates records + attempts delivery)
    if (swarmId) {
      const swarm = db.getSwarm(swarmId);
      processEventForWebhook(event, swarm?.notify_url);
    } else {
      processEventForWebhook(event);
    }

    return { success: true, event };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to emit event", { eventType, swarmId, error: message });
    return { success: false, error: message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function writeJsonl(event: EventRecord): void {
  try {
    ensureDataDir();
    const line = JSON.stringify({
      id: event.id,
      event_type: event.event_type,
      swarm_id: event.swarm_id,
      payload: event.payload ? JSON.parse(event.payload) : null,
      created_at: event.created_at,
    });
    appendFileSync(eventsPath(), line + "\n");
  } catch (err) {
    logger.warn("Failed to write JSONL event", {
      eventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
