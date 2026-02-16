import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { safeJsonParse } from "../lib/json.js";
import { nowUtc } from "../lib/time.js";
import { createSwarmFromBlueprint } from "../swarm/create.js";
import { stopSwarm } from "../swarm/stop.js";
import { nextCronRun } from "./cron.js";

export interface EvaluateResult {
  evaluated: number;
  triggered: number;
  skipped: number;
  errors: string[];
}

export function evaluateDueSchedules(): EvaluateResult {
  const dueSchedules = db.getDueSchedules();
  const result: EvaluateResult = { evaluated: dueSchedules.length, triggered: 0, skipped: 0, errors: [] };

  for (const schedule of dueSchedules) {
    try {
      const variables = safeJsonParse<Record<string, string>>(schedule.variables, {});

      // Check overlap behavior
      if (schedule.overlap_behavior === "skip" || schedule.overlap_behavior === "cancel_previous") {
        const lastRun = db.getLastScheduleRun(schedule.id);
        if (lastRun && lastRun.swarm_id) {
          const lastSwarm = db.getSwarm(lastRun.swarm_id);
          if (lastSwarm && lastSwarm.status === "buzzing") {
            if (schedule.overlap_behavior === "skip") {
              // Skip this trigger
              db.insertScheduleRun(schedule.id, null, nowUtc(), "skipped");
              emitEvent({
                eventType: "schedule.skipped",
                payload: { schedule_id: schedule.id, reason: "overlap_skip", active_swarm: lastSwarm.id },
              });
              result.skipped++;
              // Still update next_run_at
              const nextRun = nextCronRun(schedule.cron_expression, new Date());
              db.updateSchedule(schedule.id, {
                next_run_at: nextRun.toISOString().replace("T", " ").slice(0, 19),
              });
              continue;
            }
            if (schedule.overlap_behavior === "cancel_previous") {
              stopSwarm(lastSwarm.id);
            }
          }
        }
      }

      // Create the swarm
      const swarmResult = createSwarmFromBlueprint(
        schedule.blueprint_id,
        schedule.task_template,
        variables,
        undefined,
        undefined,
        { priority: schedule.priority },
      );

      if (!swarmResult.success) {
        result.errors.push(`Schedule "${schedule.name}": ${swarmResult.error}`);
        db.insertScheduleRun(schedule.id, null, nowUtc(), "error");
      } else {
        db.insertScheduleRun(schedule.id, swarmResult.data.id, nowUtc(), "started");
        emitEvent({
          eventType: "schedule.triggered",
          swarmId: swarmResult.data.id,
          payload: { schedule_id: schedule.id, name: schedule.name },
        });
        result.triggered++;
      }

      // Update schedule
      const nextRun = nextCronRun(schedule.cron_expression, new Date());
      db.updateSchedule(schedule.id, {
        last_run_at: nowUtc(),
        next_run_at: nextRun.toISOString().replace("T", " ").slice(0, 19),
        run_count: schedule.run_count + 1,
      });
    } catch (err) {
      result.errors.push(`Schedule "${schedule.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
