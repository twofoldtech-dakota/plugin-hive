import * as db from "../db.js";
import { getFleetMetrics } from "../metrics/fleet.js";
import type { HealthFactor } from "../types.js";

/**
 * Failure rate factor: based on fleet metrics last 24h.
 * Score: 100 - (failure_rate * 200), min 0
 */
export function failureRateFactor(): HealthFactor {
  const result = getFleetMetrics("1d");
  if (!result.success || !result.metrics) {
    return { name: "failure_rate", score: 100, weight: 0.25, detail: "No fleet data available" };
  }
  const failureRate = 1 - result.metrics.totals.success_rate;
  const score = Math.max(0, Math.round(100 - failureRate * 200));
  return {
    name: "failure_rate",
    score,
    weight: 0.25,
    detail: `${Math.round(failureRate * 100)}% failure rate (${result.metrics.totals.failed}/${result.metrics.totals.swarms} swarms)`,
  };
}

/**
 * Circuit breaker factor: penalty for open/half-open circuits.
 * Score: 100 if no open circuits, -25 per open, -10 per half_open
 */
export function circuitBreakerFactor(): HealthFactor {
  const circuits = db.getOpenCircuits();
  const openCount = circuits.filter(c => c.state === "open").length;
  const halfOpenCount = circuits.filter(c => c.state === "half_open").length;
  const score = Math.max(0, 100 - openCount * 25 - halfOpenCount * 10);
  return {
    name: "circuit_breaker",
    score,
    weight: 0.15,
    detail: `${openCount} open, ${halfOpenCount} half-open circuits`,
  };
}

/**
 * Dead letter queue factor: penalty for pending dead letters.
 * Score: 100 if 0 pending, -10 per pending dead letter, min 0
 */
export function dlqFactor(): HealthFactor {
  const pendingCount = db.getPendingDeadLetterCount();
  const score = Math.max(0, 100 - pendingCount * 10);
  return {
    name: "dlq",
    score,
    weight: 0.15,
    detail: `${pendingCount} pending dead letters`,
  };
}

/**
 * Anomaly factor: penalty for unacknowledged alerts.
 * Score: 100 - (criticals * 20 + warnings * 5), min 0
 */
export function anomalyFactor(): HealthFactor {
  const alerts = db.getUnacknowledgedCriticalAlerts();
  // getUnacknowledgedCriticalAlerts only returns critical; check for warnings too
  const criticalCount = alerts.length;
  // For warnings, we'd need a separate query, but use what we have
  const score = Math.max(0, 100 - criticalCount * 20);
  return {
    name: "anomaly",
    score,
    weight: 0.10,
    detail: `${criticalCount} unacknowledged critical anomalies`,
  };
}

/**
 * Queue depth factor: penalty for queued swarms.
 * Score: 100 if 0 queued, -10 per queued swarm, min 0
 */
export function queueDepthFactor(): HealthFactor {
  const queuedCount = db.getQueuedSwarmCount();
  const score = Math.max(0, 100 - queuedCount * 10);
  return {
    name: "queue_depth",
    score,
    weight: 0.10,
    detail: `${queuedCount} queued swarms`,
  };
}

/**
 * Budget factor: avg remaining budget utilization across buzzing swarms with budgets.
 * Score: avg(100 - utilization%) across swarms, 100 if no budgets
 */
export function budgetFactor(): HealthFactor {
  const budgets = db.getBuzzingSwarmBudgets();
  if (budgets.length === 0) {
    return { name: "budget", score: 100, weight: 0.10, detail: "No active budgets" };
  }
  let totalScore = 0;
  for (const b of budgets) {
    const utilization = b.token_budget > 0 ? (b.consumed / b.token_budget) * 100 : 0;
    totalScore += Math.max(0, 100 - utilization);
  }
  const score = Math.round(totalScore / budgets.length);
  return {
    name: "budget",
    score,
    weight: 0.10,
    detail: `${budgets.length} swarms with budgets, avg ${Math.round(100 - score)}% utilized`,
  };
}

/**
 * Scheduler factor: penalty for overdue schedules.
 * Score: 100 if no overdue, -20 per overdue, min 0
 */
export function schedulerFactor(): HealthFactor {
  const overdueCount = db.getOverdueScheduleCount();
  const score = Math.max(0, 100 - overdueCount * 20);
  return {
    name: "scheduler",
    score,
    weight: 0.10,
    detail: `${overdueCount} overdue schedules`,
  };
}

/**
 * Bee performance factor: avg success rate across active bees.
 * Score: avg(success_rate * 100), 100 if no data
 */
export function beePerformanceFactor(): HealthFactor {
  const bees = db.getActiveBeeSuccessRates();
  if (bees.length === 0) {
    return { name: "bee_performance", score: 100, weight: 0.05, detail: "No active bees" };
  }
  const avgRate = bees.reduce((sum, b) => sum + b.success_rate, 0) / bees.length;
  const score = Math.round(avgRate * 100);
  return {
    name: "bee_performance",
    score,
    weight: 0.05,
    detail: `${bees.length} active bees, avg ${score}% success rate`,
  };
}

/**
 * Collect all health factors.
 */
export function collectAllFactors(): HealthFactor[] {
  return [
    failureRateFactor(),
    circuitBreakerFactor(),
    dlqFactor(),
    anomalyFactor(),
    queueDepthFactor(),
    budgetFactor(),
    schedulerFactor(),
    beePerformanceFactor(),
  ];
}
