import * as db from "../db.js";

const VALID_KEYS: Record<string, { type: "number" | "boolean" | "string"; description: string }> = {
  max_concurrent_swarms: { type: "number", description: "Maximum number of buzzing swarms (0 = unlimited)" },
  max_flights_per_bee: { type: "number", description: "Maximum concurrent in-flight flights per bee" },
  retention_days: { type: "number", description: "Days before completed swarms are eligible for auto-archive" },
  auto_archive: { type: "boolean", description: "Automatically archive old completed swarms" },
  default_priority: { type: "number", description: "Default swarm priority (1-10)" },
  event_retention_days: { type: "number", description: "Days to retain events before maintenance cleanup" },
  trace_retention_days: { type: "number", description: "Days to retain flight traces before maintenance cleanup" },
  check_retention_days: { type: "number", description: "Days to retain beekeeper checks before maintenance cleanup" },
  webhook_retention_days: { type: "number", description: "Days to retain webhook deliveries before maintenance cleanup" },
  auto_maintain: { type: "boolean", description: "Automatically run maintenance during beekeeper checks" },
  adaptive_enabled: { type: "boolean", description: "Enable adaptive tuning recommendations during beekeeper checks" },
  default_token_budget: { type: "number", description: "Default token budget for new swarms (0 = unlimited)" },
  default_budget_action: { type: "string", description: "Default action when budget exceeded (warn, pause, cancel)" },
  cache_enabled: { type: "boolean", description: "Enable flight result caching" },
  cache_ttl_hours: { type: "number", description: "Default cache entry TTL in hours" },
};

export interface ConfigEntry {
  key: string;
  value: string;
  type: string;
  description: string;
  updated_at: string;
}

export function getGlobalConfig(key?: string): { success: true; config: ConfigEntry[] } | { success: false; error: string } {
  if (key) {
    const record = db.getHiveConfig(key);
    if (!record) {
      return { success: false, error: `Unknown config key: ${key}` };
    }
    const meta = VALID_KEYS[key];
    return {
      success: true,
      config: [{
        key: record.key,
        value: record.value,
        type: meta?.type ?? "string",
        description: meta?.description ?? "",
        updated_at: record.updated_at,
      }],
    };
  }

  const all = db.getAllHiveConfig();
  return {
    success: true,
    config: all.map(r => ({
      key: r.key,
      value: r.value,
      type: VALID_KEYS[r.key]?.type ?? "string",
      description: VALID_KEYS[r.key]?.description ?? "",
      updated_at: r.updated_at,
    })),
  };
}

export function setGlobalConfig(key: string, value: string): { success: true; key: string; value: string } | { success: false; error: string } {
  const meta = VALID_KEYS[key];
  if (!meta) {
    return { success: false, error: `Unknown config key: "${key}". Valid keys: ${Object.keys(VALID_KEYS).join(", ")}` };
  }

  if (meta.type === "number") {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      return { success: false, error: `"${key}" must be a non-negative number` };
    }
  }

  if (meta.type === "boolean") {
    if (value !== "true" && value !== "false") {
      return { success: false, error: `"${key}" must be "true" or "false"` };
    }
  }

  db.setHiveConfig(key, value);
  return { success: true, key, value };
}

export function getConfigValue(key: string): string | undefined {
  const record = db.getHiveConfig(key);
  return record?.value;
}

export function getConfigNumber(key: string, fallback: number): number {
  const val = getConfigValue(key);
  if (val === undefined) return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

export function getConfigBoolean(key: string, fallback: boolean): boolean {
  const val = getConfigValue(key);
  if (val === undefined) return fallback;
  return val === "true";
}
