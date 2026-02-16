import type { EventRecord } from "../types.js";

export type PayloadFormat = "standard" | "slack" | "discord";

/**
 * Format a webhook payload based on the configured format.
 */
export function formatPayload(event: EventRecord, format: PayloadFormat): Record<string, unknown> {
  switch (format) {
    case "slack":
      return formatSlack(event);
    case "discord":
      return formatDiscord(event);
    default:
      return formatStandard(event);
  }
}

function formatStandard(event: EventRecord): Record<string, unknown> {
  return {
    event_type: event.event_type,
    swarm_id: event.swarm_id,
    payload: event.payload ? JSON.parse(event.payload) : null,
    timestamp: event.created_at,
  };
}

function formatSlack(event: EventRecord): Record<string, unknown> {
  const payload = event.payload ? JSON.parse(event.payload) : {};
  const text = `*${event.event_type}*${event.swarm_id ? ` (swarm: ${event.swarm_id.slice(0, 8)})` : ""}`;
  const details = Object.entries(payload)
    .map(([k, v]) => `• ${k}: ${String(v)}`)
    .join("\n");

  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: details ? `${text}\n${details}` : text,
        },
      },
    ],
  };
}

function formatDiscord(event: EventRecord): Record<string, unknown> {
  const payload = event.payload ? JSON.parse(event.payload) : {};
  const description = Object.entries(payload)
    .map(([k, v]) => `**${k}:** ${String(v)}`)
    .join("\n");

  const colorMap: Record<string, number> = {
    "swarm.completed": 0x00ff00,
    "swarm.failed": 0xff0000,
    "flight.completed": 0x00cc00,
    "flight.failed": 0xcc0000,
    "flight.gated": 0xffaa00,
  };

  return {
    content: `Event: ${event.event_type}`,
    embeds: [
      {
        title: event.event_type,
        description: description || "No details",
        color: colorMap[event.event_type] ?? 0x0099ff,
        timestamp: event.created_at,
      },
    ],
  };
}
