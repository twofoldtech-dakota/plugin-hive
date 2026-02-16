import type { EventRecord, SlackChannelConfig } from "../../types.js";

/**
 * Format an event as Slack Block Kit payload.
 */
export function formatSlackBlocks(
  event: EventRecord,
  config: SlackChannelConfig,
): Record<string, unknown> {
  const payload = event.payload ? JSON.parse(event.payload) : {};
  const emoji = getEventEmoji(event.event_type);
  const color = getEventColor(event.event_type);

  const fields = Object.entries(payload)
    .slice(0, 10)
    .map(([k, v]) => ({
      type: "mrkdwn",
      text: `*${k}:*\n${String(v)}`,
    }));

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${event.event_type}`,
        emoji: true,
      },
    },
  ];

  if (event.swarm_id) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Swarm:* \`${event.swarm_id.slice(0, 8)}...\``,
      },
    });
  }

  if (fields.length > 0) {
    blocks.push({
      type: "section",
      fields,
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Plugin Hive | ${event.created_at}`,
      },
    ],
  });

  const result: Record<string, unknown> = { blocks };

  if (config.channel) result.channel = config.channel;
  if (config.username) result.username = config.username;
  if (config.icon_emoji) result.icon_emoji = config.icon_emoji;

  // Add attachment for color sidebar
  result.attachments = [{ color, blocks }];
  result.blocks = undefined;

  return result;
}

function getEventEmoji(eventType: string): string {
  if (eventType.includes("completed")) return ":white_check_mark:";
  if (eventType.includes("failed")) return ":x:";
  if (eventType.includes("started")) return ":rocket:";
  if (eventType.includes("gated")) return ":lock:";
  if (eventType.includes("anomaly")) return ":warning:";
  return ":bee:";
}

function getEventColor(eventType: string): string {
  if (eventType.includes("completed")) return "#36a64f";
  if (eventType.includes("failed")) return "#cc0000";
  if (eventType.includes("started")) return "#2196f3";
  if (eventType.includes("gated")) return "#ff9800";
  if (eventType.includes("anomaly")) return "#ff5722";
  return "#6c757d";
}
