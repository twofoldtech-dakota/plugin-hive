import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";

export interface TagResult {
  success: boolean;
  swarm_id: string;
  key: string;
  value?: string;
  message: string;
}

export function tagSwarm(swarmId: string, key: string, value: string): TagResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, swarm_id: swarmId, key, message: "Swarm not found" };
  }

  db.insertSwarmTag(swarmId, key, value);
  emitEvent({ eventType: "swarm.tagged", swarmId, payload: { key, value } });
  logger.info("Swarm tagged", { swarmId, key, value });
  return { success: true, swarm_id: swarmId, key, value, message: `Tag "${key}=${value}" set on swarm` };
}

export function untagSwarm(swarmId: string, key: string): TagResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, swarm_id: swarmId, key, message: "Swarm not found" };
  }

  const deleted = db.deleteSwarmTag(swarmId, key);
  if (!deleted) {
    return { success: false, swarm_id: swarmId, key, message: `Tag "${key}" not found on swarm` };
  }

  emitEvent({ eventType: "swarm.untagged", swarmId, payload: { key } });
  logger.info("Swarm untagged", { swarmId, key });
  return { success: true, swarm_id: swarmId, key, message: `Tag "${key}" removed from swarm` };
}

export function getSwarmTags(swarmId: string): { success: boolean; tags: Record<string, string>; error?: string } {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, tags: {}, error: "Swarm not found" };
  }

  const tags = db.getSwarmTags(swarmId);
  const tagMap: Record<string, string> = {};
  for (const t of tags) {
    tagMap[t.key] = t.value;
  }
  return { success: true, tags: tagMap };
}

export function listTagKeys(): string[] {
  return db.listTagKeys();
}
