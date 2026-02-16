import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { nowUtc } from "../lib/time.js";
import { getConfigNumber } from "../config/global.js";
import type { MaintenanceResult } from "../types.js";

/**
 * Run data maintenance to clean up old events, traces, beekeeper checks,
 * webhook deliveries, and orphaned pulses.
 *
 * Safety: never deletes data for active swarms (buzzing, paused, blocked, queued, scheduled).
 */
export function runMaintenance(dryRun: boolean = false): MaintenanceResult {
  const eventDays = getConfigNumber("event_retention_days", 30);
  const traceDays = getConfigNumber("trace_retention_days", 14);
  const checkDays = getConfigNumber("check_retention_days", 7);
  const webhookDays = getConfigNumber("webhook_retention_days", 14);

  let events = 0;
  let traces = 0;
  let checks = 0;
  let webhooks = 0;
  let pulses = 0;

  if (!dryRun) {
    events = db.deleteOldEvents(eventDays);
    traces = db.deleteOldTraces(traceDays);
    checks = db.deleteOldChecks(checkDays);
    webhooks = db.deleteOldWebhooks(webhookDays);
    pulses = db.deleteOrphanedPulses();

    // Update last maintenance timestamp
    db.setMetaValue("last_maintenance_at", nowUtc());

    emitEvent({
      eventType: "maintenance.completed",
      payload: {
        events_deleted: events,
        traces_deleted: traces,
        checks_deleted: checks,
        webhooks_deleted: webhooks,
        pulses_deleted: pulses,
        total: events + traces + checks + webhooks + pulses,
      },
    });

    logger.info("Maintenance completed", {
      events, traces, checks, webhooks, pulses,
      total: events + traces + checks + webhooks + pulses,
    });
  } else {
    logger.info("Maintenance dry run (no data deleted)");
  }

  return {
    dry_run: dryRun,
    deleted: { events, traces, checks, webhooks, pulses },
    total_deleted: events + traces + checks + webhooks + pulses,
  };
}
