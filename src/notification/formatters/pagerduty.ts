import type { EventRecord, PagerDutyChannelConfig } from "../../types.js";

/**
 * Format an event as a PagerDuty Events API v2 payload.
 */
export function formatPagerDutyEvent(
  event: EventRecord,
  config: PagerDutyChannelConfig,
): Record<string, unknown> {
  const payload = event.payload ? JSON.parse(event.payload) : {};
  const severity = config.severity ?? inferSeverity(event.event_type);

  return {
    routing_key: config.routing_key,
    event_action: "trigger",
    dedup_key: `hive-${event.id}`,
    payload: {
      summary: `Plugin Hive: ${event.event_type}${event.swarm_id ? ` (swarm ${event.swarm_id.slice(0, 8)})` : ""}`,
      source: "plugin-hive",
      severity,
      timestamp: event.created_at.includes("T")
        ? event.created_at
        : event.created_at.replace(" ", "T") + "Z",
      component: "hive",
      group: event.swarm_id ?? "global",
      class: event.event_type,
      custom_details: payload,
    },
  };
}

function inferSeverity(eventType: string): "critical" | "error" | "warning" | "info" {
  if (eventType.includes("failed") || eventType.includes("critical")) return "critical";
  if (eventType.includes("anomaly")) return "error";
  if (eventType.includes("gated") || eventType.includes("timeout")) return "warning";
  return "info";
}
