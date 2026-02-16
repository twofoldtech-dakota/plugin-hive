import * as db from "../db.js";
import type { NotificationConfigRecord, HiveEventType } from "../types.js";
import { safeJsonParse } from "../lib/json.js";

export type ConfigResult =
  | { success: true; config: NotificationConfigRecord }
  | { success: false; error: string };

/**
 * Get the current notification configuration.
 */
export function getConfig(): ConfigResult {
  const config = db.getNotificationConfig();
  if (!config) {
    return { success: true, config: { id: "global", default_url: null, enabled_events: null, format: "standard", created_at: "", updated_at: "" } };
  }
  return { success: true, config };
}

/**
 * Update notification configuration.
 */
export function setConfig(opts: {
  url?: string;
  events?: HiveEventType[];
  format?: "standard" | "slack" | "discord";
}): ConfigResult {
  const updates: Partial<Pick<NotificationConfigRecord, "default_url" | "enabled_events" | "format">> = {};
  if (opts.url !== undefined) updates.default_url = opts.url;
  if (opts.events !== undefined) updates.enabled_events = JSON.stringify(opts.events);
  if (opts.format !== undefined) updates.format = opts.format;

  const config = db.upsertNotificationConfig(updates);
  return { success: true, config };
}

/**
 * Check if an event type is enabled for notifications.
 */
export function isEventEnabled(eventType: string, config: NotificationConfigRecord): boolean {
  if (!config.enabled_events) return true; // all events enabled by default
  const events = safeJsonParse<string[]>(config.enabled_events, []);
  return events.length === 0 || events.includes(eventType);
}
