import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { safeJsonParse } from "../lib/json.js";
import { nowUtc } from "../lib/time.js";
import { parseCron, nextCronRun } from "./cron.js";
import type { SwarmScheduleRecord } from "../types.js";

export type ScheduleCreateResult =
  | { success: true; schedule: SwarmScheduleRecord }
  | { success: false; error: string };

export function createSchedule(params: {
  name: string;
  blueprint_id: string;
  cron_expression: string;
  task_template: string;
  variables?: Record<string, string>;
  overlap_behavior?: "skip" | "queue" | "cancel_previous";
  priority?: number;
}): ScheduleCreateResult {
  // Validate blueprint exists
  const bp = db.getBlueprint(params.blueprint_id);
  if (!bp) {
    return { success: false, error: `Blueprint "${params.blueprint_id}" not found` };
  }

  // Validate cron expression
  const cronParts = parseCron(params.cron_expression);
  if (!cronParts) {
    return { success: false, error: `Invalid cron expression: "${params.cron_expression}"` };
  }

  // Check name uniqueness
  const existing = db.getScheduleByName(params.name);
  if (existing) {
    return { success: false, error: `Schedule name "${params.name}" already exists` };
  }

  // Compute next run
  const nextRun = nextCronRun(params.cron_expression, new Date());

  const schedule = db.insertSchedule(
    params.name,
    params.blueprint_id,
    params.cron_expression,
    params.task_template,
    params.variables ? JSON.stringify(params.variables) : "{}",
    params.overlap_behavior ?? "skip",
    params.priority ?? 5,
    nextRun.toISOString().replace("T", " ").slice(0, 19),
  );

  emitEvent({
    eventType: "schedule.created",
    payload: { schedule_id: schedule.id, name: schedule.name, cron: schedule.cron_expression },
  });

  return { success: true, schedule };
}

export function listSchedulesQuery(filters?: { blueprint_id?: string; enabled?: boolean }): SwarmScheduleRecord[] {
  return db.listSchedules(filters);
}

export function deleteScheduleById(scheduleId: string): { success: boolean; error?: string } {
  const schedule = db.getSchedule(scheduleId);
  if (!schedule) {
    return { success: false, error: `Schedule "${scheduleId}" not found` };
  }
  db.deleteSchedule(scheduleId);
  emitEvent({
    eventType: "schedule.deleted",
    payload: { schedule_id: scheduleId, name: schedule.name },
  });
  return { success: true };
}

export function toggleSchedule(scheduleId: string, enabled: boolean): { success: boolean; schedule?: SwarmScheduleRecord; error?: string } {
  const schedule = db.getSchedule(scheduleId);
  if (!schedule) {
    return { success: false, error: `Schedule "${scheduleId}" not found` };
  }

  const updates: Partial<Pick<SwarmScheduleRecord, "enabled" | "next_run_at">> = {
    enabled: enabled ? 1 : 0,
  };

  // Recompute next_run_at on resume
  if (enabled) {
    const nextRun = nextCronRun(schedule.cron_expression, new Date());
    updates.next_run_at = nextRun.toISOString().replace("T", " ").slice(0, 19);
  }

  db.updateSchedule(scheduleId, updates);

  emitEvent({
    eventType: "schedule.toggled",
    payload: { schedule_id: scheduleId, enabled },
  });

  return { success: true, schedule: db.getSchedule(scheduleId) };
}

export function getScheduleHistoryQuery(scheduleId: string, limit?: number) {
  const schedule = db.getSchedule(scheduleId);
  if (!schedule) {
    return { success: false as const, error: `Schedule "${scheduleId}" not found` };
  }
  return { success: true as const, runs: db.getScheduleHistory(scheduleId, limit ?? 20), schedule };
}
