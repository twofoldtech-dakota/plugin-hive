import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { getConfigValue, getConfigNumber, getConfigBoolean } from "../config/global.js";
import type { BeeMemoryRecord } from "../types.js";

export interface MemoryStoreResult {
  success: boolean;
  message: string;
  memory?: BeeMemoryRecord;
}

export interface MemoryRecallResult {
  success: boolean;
  memories: BeeMemoryRecord[];
  total: number;
}

/**
 * Store a memory entry for a bee.
 */
export function storeMemory(
  beeId: string,
  key: string,
  value: string,
  namespace: string = "default",
  ttlMinutes?: number,
): MemoryStoreResult {
  if (!getConfigBoolean("bee_memory_enabled", false)) {
    return { success: false, message: "Bee memory is disabled. Enable with: hive config bee_memory_enabled true" };
  }

  const maxChars = getConfigNumber("bee_memory_max_chars", 2000);
  if (value.length > maxChars) {
    return { success: false, message: `Value exceeds max chars (${value.length}/${maxChars})` };
  }

  const expiresAt = ttlMinutes
    ? new Date(Date.now() + ttlMinutes * 60_000).toISOString().replace("T", " ").slice(0, 19)
    : undefined;

  const memory = db.upsertBeeMemory(beeId, namespace, key, value, expiresAt);
  emitEvent({ eventType: "memory.stored", payload: { bee_id: beeId, namespace, key } });
  logger.info("Bee memory stored", { beeId, namespace, key });
  return { success: true, message: `Memory stored: ${beeId}/${namespace}/${key}`, memory };
}

/**
 * Recall memories for a bee, optionally filtered by namespace.
 */
export function recallMemory(beeId: string, namespace?: string): MemoryRecallResult {
  const memories = db.getBeeMemories(beeId, namespace);
  return { success: true, memories, total: memories.length };
}

/**
 * Delete memories for a bee.
 */
export function forgetMemory(
  beeId: string,
  namespace?: string,
  key?: string,
): { success: boolean; deleted: number; message: string } {
  const deleted = db.deleteBeeMemory(beeId, namespace, key);
  if (deleted > 0) {
    emitEvent({ eventType: "memory.forgotten", payload: { bee_id: beeId, namespace, key, deleted } });
    logger.info("Bee memory forgotten", { beeId, namespace, key, deleted });
  }
  return { success: true, deleted, message: `Deleted ${deleted} memory entries` };
}

/**
 * Prune expired memories.
 */
export function pruneExpiredMemories(): { pruned: number } {
  const pruned = db.pruneExpiredMemories();
  if (pruned > 0) {
    emitEvent({ eventType: "memory.pruned", payload: { pruned } });
    logger.info("Pruned expired memories", { pruned });
  }
  return { pruned };
}

/**
 * Get memory statistics.
 */
export function getMemoryStats(): { total_entries: number; total_bees: number; expired: number; enabled: boolean } {
  const stats = db.getBeeMemoryStats();
  return { ...stats, enabled: getConfigBoolean("bee_memory_enabled", false) };
}

/**
 * Build a memory context section for injection into bee prompts.
 * Returns empty string if memory is disabled or no memories exist.
 */
export function buildMemoryContext(beeId: string, blueprintId: string): string {
  if (!getConfigBoolean("bee_memory_enabled", false)) return "";

  const maxEntries = getConfigNumber("bee_memory_max_entries", 10);
  const maxChars = getConfigNumber("bee_memory_max_chars", 2000);

  // Recall from both bee-specific and blueprint namespace
  const beeMemories = db.getBeeMemories(beeId, "default");
  const bpMemories = db.getBeeMemories(beeId, blueprintId);

  const allMemories = [...beeMemories, ...bpMemories];
  if (allMemories.length === 0) return "";

  // Deduplicate by key (prefer bee-specific over blueprint)
  const seen = new Set<string>();
  const unique: BeeMemoryRecord[] = [];
  for (const m of allMemories) {
    const dedup = `${m.namespace}:${m.key}`;
    if (!seen.has(dedup)) {
      seen.add(dedup);
      unique.push(m);
    }
  }

  // Cap entries and total chars
  const capped = unique.slice(0, maxEntries);
  let totalChars = 0;
  const lines: string[] = [];
  for (const m of capped) {
    const line = `- **${m.key}** (${m.namespace}): ${m.value}`;
    if (totalChars + line.length > maxChars) break;
    lines.push(line);
    totalChars += line.length;
  }

  if (lines.length === 0) return "";

  return `\n## Bee Memory\n\nPast context from previous flights:\n${lines.join("\n")}\n`;
}

/**
 * Auto-capture MEMORY: keys from flight output.
 */
export function autoCaptureMemories(beeId: string, output: string, namespace: string = "default"): number {
  if (!getConfigBoolean("bee_memory_auto_capture", false)) return 0;
  if (!getConfigBoolean("bee_memory_enabled", false)) return 0;

  let captured = 0;
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^MEMORY:\s*(\S+)\s*=\s*(.+)$/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();
      db.upsertBeeMemory(beeId, namespace, key, value);
      captured++;
    }
  }

  if (captured > 0) {
    logger.info("Auto-captured bee memories", { beeId, namespace, captured });
  }
  return captured;
}
