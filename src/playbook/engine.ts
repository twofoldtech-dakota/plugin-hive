import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import { getConfigBoolean } from "../config/global.js";
import { nowUtc } from "../lib/time.js";
import { runMaintenance } from "../maintenance/janitor.js";
import type { PlaybookRecord, PlaybookAction, PlaybookTriggerType } from "../types.js";

interface TriggerCondition {
  type: PlaybookTriggerType;
  threshold: number;
}

interface PlaybookEvalResult {
  evaluated: number;
  triggered: number;
  skipped_cooldown: number;
  skipped_disabled: number;
  errors: string[];
}

/**
 * Evaluate all enabled playbooks against current hive state.
 * Called by the beekeeper after health score computation.
 */
export function evaluatePlaybooks(): PlaybookEvalResult {
  if (!getConfigBoolean("playbooks_enabled", false)) {
    return { evaluated: 0, triggered: 0, skipped_cooldown: 0, skipped_disabled: 0, errors: [] };
  }

  const playbooks = db.listPlaybooks(true); // only enabled
  const result: PlaybookEvalResult = { evaluated: playbooks.length, triggered: 0, skipped_cooldown: 0, skipped_disabled: 0, errors: [] };

  for (const playbook of playbooks) {
    try {
      const evalResult = evaluateOne(playbook);
      if (evalResult === "triggered") result.triggered++;
      else if (evalResult === "cooldown") result.skipped_cooldown++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${playbook.name}: ${msg}`);
      logger.error("Playbook evaluation error", { playbook: playbook.name, error: msg });
    }
  }

  return result;
}

function evaluateOne(playbook: PlaybookRecord): "triggered" | "cooldown" | "not_triggered" {
  const condition = safeJsonParse<TriggerCondition | null>(playbook.trigger_condition, null);
  if (!condition) return "not_triggered";

  // Check cooldown
  if (playbook.last_executed_at) {
    const lastExec = new Date(playbook.last_executed_at.replace(" ", "T") + "Z").getTime();
    const cooldownMs = playbook.cooldown_minutes * 60_000;
    if (Date.now() - lastExec < cooldownMs) {
      emitEvent({ eventType: "playbook.cooldown", payload: { playbook_id: playbook.id, name: playbook.name } });
      return "cooldown";
    }
  }

  // Evaluate trigger condition
  const currentValue = getCurrentValue(condition.type);
  if (currentValue === null || !shouldTrigger(condition, currentValue)) {
    return "not_triggered";
  }

  // Trigger! Execute actions
  emitEvent({ eventType: "playbook.triggered", payload: { playbook_id: playbook.id, name: playbook.name, trigger_value: currentValue } });

  const actions = safeJsonParse<PlaybookAction[]>(playbook.actions, []);
  const actionResults = executeActions(actions);

  const allSuccess = actionResults.every(r => r.success);
  const now = nowUtc();

  db.insertPlaybookExecution(
    playbook.id,
    currentValue,
    JSON.stringify(actions),
    JSON.stringify(actionResults),
    allSuccess,
  );

  db.updatePlaybook(playbook.id, {
    last_executed_at: now,
    execution_count: playbook.execution_count + 1,
  });

  emitEvent({ eventType: "playbook.executed", payload: { playbook_id: playbook.id, name: playbook.name, success: allSuccess, actions: actionResults.length } });
  logger.info("Playbook executed", { playbook: playbook.name, triggerValue: currentValue, actions: actionResults.length, allSuccess });

  return "triggered";
}

function getCurrentValue(triggerType: PlaybookTriggerType): number | null {
  switch (triggerType) {
    case "health_below": {
      const snapshot = db.getLatestHealthSnapshot();
      return snapshot ? snapshot.composite_score : null;
    }
    case "swarm_failure_rate": {
      const buzzing = db.listSwarms({ status: "buzzing" });
      const failed = db.listSwarms({ status: "failed" });
      const total = buzzing.length + failed.length;
      if (total === 0) return 0;
      return (failed.length / total) * 100;
    }
    case "circuit_open_count": {
      const open = db.getOpenCircuits();
      return open.length;
    }
    case "dead_letter_count": {
      return db.getPendingDeadLetterCount();
    }
    case "queue_depth": {
      return db.getQueuedSwarmCount();
    }
    default:
      return null;
  }
}

function shouldTrigger(condition: TriggerCondition, currentValue: number): boolean {
  switch (condition.type) {
    case "health_below":
      return currentValue < condition.threshold;
    case "swarm_failure_rate":
      return currentValue > condition.threshold;
    case "circuit_open_count":
    case "dead_letter_count":
    case "queue_depth":
      return currentValue >= condition.threshold;
    default:
      return false;
  }
}

interface ActionResult {
  type: string;
  success: boolean;
  detail: string;
}

function executeActions(actions: PlaybookAction[]): ActionResult[] {
  const results: ActionResult[] = [];

  for (const action of actions) {
    try {
      const result = executeAction(action);
      results.push(result);
    } catch (err) {
      results.push({
        type: action.type,
        success: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

function executeAction(action: PlaybookAction): ActionResult {
  switch (action.type) {
    case "pause_swarms": {
      const buzzing = db.listSwarms({ status: "buzzing" });
      let paused = 0;
      for (const swarm of buzzing) {
        db.updateSwarm(swarm.id, { status: "paused" });
        paused++;
      }
      return { type: "pause_swarms", success: true, detail: `Paused ${paused} buzzing swarm(s)` };
    }

    case "cancel_swarms": {
      const buzzing = db.listSwarms({ status: "buzzing" });
      let cancelled = 0;
      for (const swarm of buzzing) {
        db.updateSwarm(swarm.id, { status: "cancelled" });
        emitEvent({ eventType: "swarm.cancelled", swarmId: swarm.id, payload: { reason: "playbook" } });
        cancelled++;
      }
      return { type: "cancel_swarms", success: true, detail: `Cancelled ${cancelled} swarm(s)` };
    }

    case "reset_circuits": {
      const open = db.getOpenCircuits();
      for (const c of open) {
        db.upsertCircuitBreaker(c.bee_id, { state: "closed", failure_count: 0, success_count: 0, opened_at: null, half_open_at: null });
        emitEvent({ eventType: "circuit.closed", payload: { bee_id: c.bee_id, reason: "playbook" } });
      }
      return { type: "reset_circuits", success: true, detail: `Reset ${open.length} circuit(s)` };
    }

    case "purge_dlq": {
      const deadLetters = db.listDeadLetters({ status: "pending" });
      for (const dl of deadLetters) {
        db.updateDeadLetter(dl.id, { status: "purged" });
      }
      return { type: "purge_dlq", success: true, detail: `Purged ${deadLetters.length} dead letter(s)` };
    }

    case "notify": {
      const message = action.params?.message ?? "Playbook triggered";
      emitEvent({ eventType: "health.alert", payload: { message, source: "playbook" } });
      return { type: "notify", success: true, detail: `Notification sent: ${message}` };
    }

    case "run_maintenance": {
      const maintenanceResult = runMaintenance(false);
      return { type: "run_maintenance", success: true, detail: `Maintenance: deleted ${maintenanceResult.total_deleted} records` };
    }

    default:
      return { type: action.type, success: false, detail: `Unknown action type: ${action.type}` };
  }
}
