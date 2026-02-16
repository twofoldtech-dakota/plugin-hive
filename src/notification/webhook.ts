import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import { nowUtc } from "../lib/time.js";
import { formatPayload } from "./format.js";
import { isEventEnabled } from "./config.js";
import type { EventRecord, NotificationConfigRecord, WebhookDeliveryRecord } from "../types.js";

/**
 * Process an event for webhook delivery.
 * Creates delivery records and attempts immediate delivery.
 */
export function processEventForWebhook(
  event: EventRecord,
  swarmNotifyUrl?: string | null,
): void {
  const config = db.getNotificationConfig();
  const urls: string[] = [];

  // Add swarm-level URL
  if (swarmNotifyUrl) {
    urls.push(swarmNotifyUrl);
  }

  // Add global URL if event is enabled
  if (config?.default_url && isEventEnabled(event.event_type, config)) {
    if (!urls.includes(config.default_url)) {
      urls.push(config.default_url);
    }
  }

  for (const url of urls) {
    const delivery = db.insertWebhookDelivery(event.id, url);
    attemptDelivery(delivery, event, config).catch(() => {
      // Swallowed — delivery failures are recorded in the DB
    });
  }
}

/**
 * Attempt delivery of a webhook.
 */
async function attemptDelivery(
  delivery: WebhookDeliveryRecord,
  event: EventRecord,
  config: NotificationConfigRecord | undefined,
): Promise<void> {
  const format = config?.format ?? "standard";
  const payload = formatPayload(event, format);
  const now = nowUtc();

  try {
    const response = await fetch(delivery.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    db.updateWebhookDelivery(delivery.id, {
      attempts: delivery.attempts + 1,
      last_attempt_at: now,
      response_status: response.status,
      status: response.ok ? "delivered" : "failed",
      last_error: response.ok ? null : `HTTP ${response.status}`,
      next_retry_at: response.ok ? null : computeNextRetry(delivery.attempts + 1),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    db.updateWebhookDelivery(delivery.id, {
      attempts: delivery.attempts + 1,
      last_attempt_at: now,
      status: "failed",
      last_error: errMsg,
      next_retry_at: computeNextRetry(delivery.attempts + 1),
    });
    logger.warn("Webhook delivery failed", { deliveryId: delivery.id, error: errMsg });
  }
}

/**
 * Retry a specific failed delivery.
 */
export async function retryDelivery(deliveryId: string): Promise<{ success: boolean; error?: string }> {
  const delivery = db.getWebhookDelivery(deliveryId);
  if (!delivery) {
    return { success: false, error: `Delivery "${deliveryId}" not found` };
  }
  if (delivery.status === "delivered") {
    return { success: false, error: "Delivery already succeeded" };
  }

  const events = db.getRecentEvents(500);
  const event = events.find(e => e.id === delivery.event_id);
  if (!event) {
    return { success: false, error: "Original event not found" };
  }

  const config = db.getNotificationConfig();
  await attemptDelivery(delivery, event, config);

  const updated = db.getWebhookDelivery(deliveryId);
  return { success: updated?.status === "delivered" };
}

/**
 * Retry all failed deliveries that are eligible.
 */
export async function retryAllFailed(): Promise<{ retried: number; succeeded: number }> {
  const failed = db.getFailedWebhookDeliveries();
  let retried = 0;
  let succeeded = 0;

  for (const delivery of failed) {
    const result = await retryDelivery(delivery.id);
    retried++;
    if (result.success) succeeded++;
  }

  return { retried, succeeded };
}

function computeNextRetry(attempts: number): string {
  const delaySec = 30 * Math.pow(4, attempts - 1);
  const d = new Date();
  d.setSeconds(d.getSeconds() + delaySec);
  return d.toISOString().replace("T", " ").slice(0, 19);
}
