import type { EventRecord, DiscordChannelConfig } from "../../types.js";

/**
 * Format an event as Discord webhook embed payload.
 */
export function formatDiscordEmbed(
  event: EventRecord,
  config: DiscordChannelConfig,
): Record<string, unknown> {
  const payload = event.payload ? JSON.parse(event.payload) : {};
  const color = getEventColor(event.event_type);

  const fields = Object.entries(payload)
    .slice(0, 25)
    .map(([k, v]) => ({
      name: k,
      value: String(v).slice(0, 1024),
      inline: String(v).length < 40,
    }));

  const embed: Record<string, unknown> = {
    title: event.event_type,
    color,
    timestamp: event.created_at.includes("T")
      ? event.created_at
      : event.created_at.replace(" ", "T") + "Z",
    footer: { text: "Plugin Hive" },
  };

  if (event.swarm_id) {
    embed.description = `Swarm: \`${event.swarm_id.slice(0, 8)}...\``;
  }

  if (fields.length > 0) {
    embed.fields = fields;
  }

  const result: Record<string, unknown> = {
    embeds: [embed],
  };

  if (config.username) result.username = config.username;
  if (config.avatar_url) result.avatar_url = config.avatar_url;

  return result;
}

function getEventColor(eventType: string): number {
  if (eventType.includes("completed")) return 0x36a64f;
  if (eventType.includes("failed")) return 0xcc0000;
  if (eventType.includes("started")) return 0x2196f3;
  if (eventType.includes("gated")) return 0xff9800;
  if (eventType.includes("anomaly")) return 0xff5722;
  return 0x6c757d;
}
