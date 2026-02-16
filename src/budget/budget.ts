import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { getConfigNumber, getConfigValue } from "../config/global.js";
import type { BudgetStatus, BudgetSetResult } from "../types.js";

export type SetBudgetResult =
  | { success: true; result: BudgetSetResult }
  | { success: false; error: string };

export type GetBudgetStatusResult =
  | { success: true; status: BudgetStatus }
  | { success: false; error: string };

/**
 * Set or update the token budget for a swarm.
 */
export function setBudget(
  swarmId: string,
  tokenBudget: number,
  action?: string,
): SetBudgetResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  const budgetAction = action ?? getConfigValue("default_budget_action") ?? "warn";
  if (!["warn", "pause", "cancel"].includes(budgetAction)) {
    return { success: false, error: `Invalid budget action: "${budgetAction}". Must be warn, pause, or cancel.` };
  }

  db.setSwarmBudget(swarmId, tokenBudget, budgetAction);
  const consumed = db.getSwarmTokenUsage(swarmId);

  logger.info("Budget set", { swarmId, tokenBudget, budgetAction });
  return {
    success: true,
    result: {
      swarm_id: swarmId,
      token_budget: tokenBudget,
      budget_action: budgetAction,
      consumed,
    },
  };
}

/**
 * Get budget utilization and projection for a swarm.
 */
export function getBudgetStatus(swarmId: string): GetBudgetStatusResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  const tokenBudget = (swarm as unknown as { token_budget: number }).token_budget ?? 0;
  const budgetAction = ((swarm as unknown as { budget_action: string }).budget_action ?? "warn") as "warn" | "pause" | "cancel";
  const consumed = db.getSwarmTokenUsage(swarmId);
  const remaining = tokenBudget > 0 ? Math.max(0, tokenBudget - consumed) : 0;
  const utilization = tokenBudget > 0 ? consumed / tokenBudget : 0;
  const exceeded = tokenBudget > 0 && consumed > tokenBudget;

  // Project total based on flight completion ratio
  let projection: number | null = null;
  const flights = db.getFlightsForSwarm(swarmId).filter(f => !f.verify_meta);
  const done = flights.filter(f => f.status === "done").length;
  if (done > 0 && done < flights.length) {
    projection = Math.round((consumed / done) * flights.length);
  }

  return {
    success: true,
    status: {
      swarm_id: swarmId,
      token_budget: tokenBudget,
      budget_action: budgetAction,
      consumed,
      remaining,
      utilization: Math.round(utilization * 1000) / 1000,
      exceeded,
      projection,
    },
  };
}

/**
 * Check budget after a flight completes. Emits events and takes action if exceeded.
 * Called from flight/complete.ts after recording usage.
 */
export function checkBudget(swarmId: string): void {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) return;

  const tokenBudget = (swarm as unknown as { token_budget: number }).token_budget ?? 0;
  if (tokenBudget <= 0) return; // No budget set

  const budgetAction = ((swarm as unknown as { budget_action: string }).budget_action ?? "warn") as string;
  const consumed = db.getSwarmTokenUsage(swarmId);

  // 80% warning threshold
  if (consumed >= tokenBudget * 0.8 && consumed < tokenBudget) {
    emitEvent({
      eventType: "swarm.budget_warning",
      swarmId,
      payload: { consumed, budget: tokenBudget, utilization: consumed / tokenBudget },
    });
    logger.warn("Budget warning: 80% consumed", { swarmId, consumed, budget: tokenBudget });
  }

  // Budget exceeded
  if (consumed >= tokenBudget) {
    emitEvent({
      eventType: "swarm.budget_exceeded",
      swarmId,
      payload: { consumed, budget: tokenBudget, action: budgetAction },
    });

    if (budgetAction === "pause") {
      db.updateSwarm(swarmId, { status: "paused" });
      db.bumpEpoch();
      logger.info("Budget exceeded: swarm paused", { swarmId, consumed, budget: tokenBudget });
    } else if (budgetAction === "cancel") {
      db.updateSwarm(swarmId, { status: "cancelled" });
      db.bumpEpoch();
      emitEvent({ eventType: "swarm.cancelled", swarmId, payload: { reason: "budget_exceeded" } });
      logger.info("Budget exceeded: swarm cancelled", { swarmId, consumed, budget: tokenBudget });
    } else {
      // warn — just log
      logger.warn("Budget exceeded: warning only", { swarmId, consumed, budget: tokenBudget });
    }
  }
}
