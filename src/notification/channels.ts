import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import type {
  NotificationChannelRecord,
  NotificationChannelType,
  SlackChannelConfig,
  DiscordChannelConfig,
  PagerDutyChannelConfig,
  WebhookChannelConfig,
} from "../types.js";

type ChannelConfig = SlackChannelConfig | DiscordChannelConfig | PagerDutyChannelConfig | WebhookChannelConfig;

/**
 * Create a notification channel.
 */
export function createChannel(
  name: string,
  channelType: NotificationChannelType,
  config: ChannelConfig,
): { success: true; channel: NotificationChannelRecord } | { success: false; error: string } {
  // Validate config based on type
  const validation = validateChannelConfig(channelType, config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const channel = db.insertNotificationChannel(name, channelType, JSON.stringify(config));

  emitEvent({
    eventType: "channel.created",
    payload: { channel_id: channel.id, name, type: channelType },
  });

  logger.info("Notification channel created", { channelId: channel.id, name, type: channelType });
  return { success: true, channel };
}

/**
 * List all notification channels.
 */
export function listChannels(): NotificationChannelRecord[] {
  return db.listNotificationChannels();
}

/**
 * Delete a notification channel and its routes.
 */
export function deleteChannel(channelId: string): { success: boolean; error?: string } {
  const deleted = db.deleteNotificationChannel(channelId);
  if (!deleted) {
    return { success: false, error: `Channel "${channelId}" not found` };
  }

  emitEvent({
    eventType: "channel.deleted",
    payload: { channel_id: channelId },
  });

  logger.info("Notification channel deleted", { channelId });
  return { success: true };
}

/**
 * Validate channel configuration based on type.
 */
function validateChannelConfig(
  channelType: NotificationChannelType,
  config: ChannelConfig,
): { valid: true } | { valid: false; error: string } {
  switch (channelType) {
    case "slack": {
      const c = config as SlackChannelConfig;
      if (!c.webhook_url) return { valid: false, error: "Slack channel requires webhook_url" };
      if (!c.webhook_url.startsWith("https://hooks.slack.com/")) {
        return { valid: false, error: "Invalid Slack webhook URL" };
      }
      return { valid: true };
    }
    case "discord": {
      const c = config as DiscordChannelConfig;
      if (!c.webhook_url) return { valid: false, error: "Discord channel requires webhook_url" };
      if (!c.webhook_url.startsWith("https://discord.com/api/webhooks/")) {
        return { valid: false, error: "Invalid Discord webhook URL" };
      }
      return { valid: true };
    }
    case "pagerduty": {
      const c = config as PagerDutyChannelConfig;
      if (!c.routing_key) return { valid: false, error: "PagerDuty channel requires routing_key" };
      return { valid: true };
    }
    case "webhook": {
      const c = config as WebhookChannelConfig;
      if (!c.url) return { valid: false, error: "Webhook channel requires url" };
      try {
        new URL(c.url);
      } catch {
        return { valid: false, error: "Invalid webhook URL" };
      }
      return { valid: true };
    }
    default:
      return { valid: false, error: `Unknown channel type: ${channelType}` };
  }
}
