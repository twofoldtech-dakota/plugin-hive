import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import { formatSlackBlocks } from "./formatters/slack-blocks.js";
import { formatDiscordEmbed } from "./formatters/discord-embed.js";
import { formatPagerDutyEvent } from "./formatters/pagerduty.js";
import type {
  EventRecord,
  NotificationChannelRecord,
  NotificationRouteRecord,
  SlackChannelConfig,
  DiscordChannelConfig,
  PagerDutyChannelConfig,
  WebhookChannelConfig,
} from "../types.js";

/**
 * Create a notification route.
 */
export function createRoute(
  eventPattern: string,
  channelId: string,
  priority: number = 0,
): { success: true; route: NotificationRouteRecord } | { success: false; error: string } {
  const channel = db.getNotificationChannel(channelId);
  if (!channel) {
    return { success: false, error: `Channel "${channelId}" not found` };
  }

  const route = db.insertNotificationRoute(eventPattern, channelId, priority);

  emitEvent({
    eventType: "route.created",
    payload: { route_id: route.id, event_pattern: eventPattern, channel_id: channelId },
  });

  return { success: true, route };
}

/**
 * List all notification routes.
 */
export function listRoutes(): NotificationRouteRecord[] {
  return db.listNotificationRoutes();
}

/**
 * Delete a notification route.
 */
export function deleteRoute(routeId: string): { success: boolean; error?: string } {
  const deleted = db.deleteNotificationRoute(routeId);
  if (!deleted) {
    return { success: false, error: `Route "${routeId}" not found` };
  }
  return { success: true };
}

/**
 * Route an event through the v2 notification channel system.
 * Called from emitEvent() after the legacy webhook system.
 */
export function routeEventToChannels(event: EventRecord): void {
  const matched = db.getRoutesForEvent(event.event_type);
  if (matched.length === 0) return;

  for (const { channel } of matched) {
    deliverToChannel(channel, event).catch((err) => {
      logger.warn("Channel delivery failed", {
        channelId: channel.id,
        eventType: event.event_type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Deliver an event to a specific notification channel.
 */
async function deliverToChannel(
  channel: NotificationChannelRecord,
  event: EventRecord,
): Promise<void> {
  const config = safeJsonParse<Record<string, unknown>>(channel.config, {});

  switch (channel.channel_type) {
    case "slack":
      await deliverSlack(config as unknown as SlackChannelConfig, event);
      break;
    case "discord":
      await deliverDiscord(config as unknown as DiscordChannelConfig, event);
      break;
    case "pagerduty":
      await deliverPagerDuty(config as unknown as PagerDutyChannelConfig, event);
      break;
    case "webhook":
      await deliverWebhook(config as unknown as WebhookChannelConfig, event);
      break;
    default:
      logger.warn("Unknown channel type", { channelType: channel.channel_type });
  }
}

async function deliverSlack(config: SlackChannelConfig, event: EventRecord): Promise<void> {
  const payload = formatSlackBlocks(event, config);
  await fetch(config.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
}

async function deliverDiscord(config: DiscordChannelConfig, event: EventRecord): Promise<void> {
  const payload = formatDiscordEmbed(event, config);
  await fetch(config.webhook_url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
}

async function deliverPagerDuty(config: PagerDutyChannelConfig, event: EventRecord): Promise<void> {
  const payload = formatPagerDutyEvent(event, config);
  await fetch("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
}

async function deliverWebhook(config: WebhookChannelConfig, event: EventRecord): Promise<void> {
  const payload = {
    event_type: event.event_type,
    swarm_id: event.swarm_id,
    payload: event.payload ? JSON.parse(event.payload) : null,
    timestamp: event.created_at,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {}),
  };

  await fetch(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
}
