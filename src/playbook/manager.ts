import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import type { PlaybookRecord, PlaybookAction, PlaybookTriggerType } from "../types.js";

export interface PlaybookCreateResult {
  success: boolean;
  message: string;
  playbook?: PlaybookRecord;
}

export function createPlaybook(
  name: string,
  triggerType: PlaybookTriggerType,
  threshold: number,
  actions: PlaybookAction[],
  opts?: { description?: string; cooldown_minutes?: number },
): PlaybookCreateResult {
  const existing = db.getPlaybookByName(name);
  if (existing) {
    return { success: false, message: `Playbook "${name}" already exists` };
  }

  if (actions.length === 0) {
    return { success: false, message: "Playbook must have at least one action" };
  }

  const triggerCondition = JSON.stringify({ type: triggerType, threshold });
  const actionsJson = JSON.stringify(actions);

  const playbook = db.insertPlaybook(
    name,
    opts?.description ?? null,
    triggerCondition,
    actionsJson,
    opts?.cooldown_minutes ?? 30,
  );

  emitEvent({ eventType: "playbook.created", payload: { name, trigger_type: triggerType } });
  logger.info("Playbook created", { name, triggerType, threshold });
  return { success: true, message: `Playbook "${name}" created`, playbook };
}

export function listPlaybooks(enabled?: boolean): PlaybookRecord[] {
  return db.listPlaybooks(enabled);
}

export function deletePlaybook(id: string): { success: boolean; message: string } {
  const playbook = db.getPlaybook(id);
  if (!playbook) {
    return { success: false, message: `Playbook not found: ${id}` };
  }

  db.deletePlaybook(id);
  emitEvent({ eventType: "playbook.deleted", payload: { id, name: playbook.name } });
  logger.info("Playbook deleted", { id, name: playbook.name });
  return { success: true, message: `Playbook "${playbook.name}" deleted` };
}

export function togglePlaybook(id: string): { success: boolean; message: string; enabled?: boolean } {
  const playbook = db.getPlaybook(id);
  if (!playbook) {
    return { success: false, message: `Playbook not found: ${id}` };
  }

  const newEnabled = playbook.enabled ? 0 : 1;
  db.updatePlaybook(id, { enabled: newEnabled });
  emitEvent({ eventType: "playbook.toggled", payload: { id, name: playbook.name, enabled: !!newEnabled } });
  logger.info("Playbook toggled", { id, name: playbook.name, enabled: !!newEnabled });
  return { success: true, message: `Playbook "${playbook.name}" ${newEnabled ? "enabled" : "disabled"}`, enabled: !!newEnabled };
}

export function getPlaybookHistory(playbookId?: string, limit: number = 20) {
  return db.getPlaybookExecutions(playbookId, limit);
}
