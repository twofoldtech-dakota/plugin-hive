import * as db from "../db.js";
import { scheduler } from "../pollinator/scheduler.js";
import { getConfigBoolean, getConfigNumber } from "../config/global.js";
import { nowUtc } from "../lib/time.js";
import type { CheckResult } from "../types.js";
import type { ResolvedThresholds } from "./config.js";

/**
 * Check for flights stuck in "in_flight" status beyond timeout.
 * Pulse-aware: if a recent pulse exists within half the timeout, downgrade to advisory.
 */
export function checkStuckFlights(timeoutMinutes: number = 35): CheckResult[] {
  const stuck = db.getStuckFlights(timeoutMinutes);
  const halfThresholdMs = (timeoutMinutes * 60 * 1000) / 2;

  return stuck.map((f) => {
    // Check for recent pulse
    const latestPulse = db.getLatestPulseForFlight(f.id);
    if (latestPulse) {
      const pulseAge = Date.now() - new Date(latestPulse.created_at.replace(" ", "T") + "Z").getTime();
      if (pulseAge < halfThresholdMs) {
        // Recent pulse — downgrade to advisory (no remediation)
        return {
          issue: `Flight "${f.flight_id}" slow but has recent pulse (${latestPulse.step}: ${Math.round(latestPulse.progress * 100)}%)`,
          severity: "warning" as const,
          entity_type: "flight" as const,
          entity_id: f.id,
          // No remediation — advisory only
        };
      }
    }

    // Use started_at for smarter severity: >60 min is critical
    const elapsed = f.started_at ? db.getFlightElapsed(f.id) : null;
    const severity = elapsed !== null && elapsed > 3600 ? "critical" as const : "warning" as const;
    return {
      issue: `Flight "${f.flight_id}" stuck in_flight for ${timeoutMinutes}+ minutes`,
      severity,
      entity_type: "flight" as const,
      entity_id: f.id,
      remediation: "resetStuckFlight",
    };
  });
}

/**
 * Check for swarms with no progress beyond timeout.
 */
export function checkStalledSwarms(timeoutMinutes: number = 30): CheckResult[] {
  const stalled = db.getStalledSwarms(timeoutMinutes);
  return stalled.map((s) => ({
    issue: `Swarm #${s.swarm_number} stalled (no progress in ${timeoutMinutes}+ minutes)`,
    severity: "warning" as const,
    entity_type: "swarm" as const,
    entity_id: s.id,
    remediation: "advanceStalledSwarm",
  }));
}

/**
 * Check for zombie swarms — buzzing but all regular flights are done/failed.
 */
export function checkZombieSwarms(): CheckResult[] {
  const zombies = db.getZombieSwarms();
  return zombies.map((s) => ({
    issue: `Swarm #${s.swarm_number} is zombie (buzzing but all flights finished)`,
    severity: "critical" as const,
    entity_type: "swarm" as const,
    entity_id: s.id,
    remediation: "resolveZombieSwarm",
  }));
}

/**
 * Check for schedulers registered to swarms that are no longer buzzing.
 */
export function checkOrphanedSchedulers(): CheckResult[] {
  const results: CheckResult[] = [];
  const registeredIds = scheduler.getRegisteredSwarmIds();

  for (const swarmId of registeredIds) {
    const swarm = db.getSwarm(swarmId);
    if (!swarm || swarm.status !== "buzzing") {
      results.push({
        issue: `Scheduler registered for non-buzzing swarm ${swarmId.slice(0, 8)}`,
        severity: "warning",
        entity_type: "scheduler",
        entity_id: swarmId,
        remediation: "stopOrphanedScheduler",
      });
    }
  }

  return results;
}

/**
 * Check for flights that have been abandoned 5+ times but aren't failed.
 */
export function checkExhaustedRetries(): CheckResult[] {
  const exhausted = db.getExhaustedFlights();
  return exhausted.map((f) => ({
    issue: `Flight "${f.flight_id}" exhausted abandon limit (${f.abandoned_count}/5)`,
    severity: "critical" as const,
    entity_type: "flight" as const,
    entity_id: f.id,
    remediation: "failExhaustedFlight",
  }));
}

// ── Phase 9: New Checks ─────────────────────────────────────────────

/**
 * Check for verification loops — cells retried N+ times but still pending.
 */
export function checkVerificationLoops(swarmId: string, thresholds: ResolvedThresholds): CheckResult[] {
  const loopCells = db.getVerificationLoopCells(swarmId, thresholds.verification_loop_max);
  return loopCells.map((c) => ({
    issue: `Cell "${c.cell_id}" in verification loop (retried ${c.retry_count}/${thresholds.verification_loop_max}+ times)`,
    severity: "critical" as const,
    entity_type: "flight" as const, // remediation targets the cell's parent flight context
    entity_id: c.id,
    remediation: "forcePassCell",
  }));
}

/**
 * Check for cells stuck in "in_progress" beyond threshold.
 */
export function checkStuckCells(swarmId: string, thresholds: ResolvedThresholds): CheckResult[] {
  const stuck = db.getStuckCells(swarmId, thresholds.cell_stuck_minutes);
  return stuck.map((c) => ({
    issue: `Cell "${c.cell_id}" stuck in_progress for ${thresholds.cell_stuck_minutes}+ minutes`,
    severity: "warning" as const,
    entity_type: "flight" as const,
    entity_id: c.id,
    remediation: "resetStuckCell",
  }));
}

/**
 * Check for failed webhook deliveries that need retry.
 */
export function checkFailedWebhooks(): CheckResult[] {
  const failed = db.getFailedWebhookDeliveries();
  return failed.map((d) => ({
    issue: `Webhook delivery ${d.id.slice(0, 8)} failed (${d.attempts}/${d.max_attempts} attempts)`,
    severity: d.attempts >= d.max_attempts - 1 ? "critical" as const : "warning" as const,
    entity_type: "webhook" as const,
    entity_id: d.id,
    remediation: "retryWebhook",
  }));
}

/**
 * Check for flights approaching timeout (slow flight advisory).
 */
export function checkSlowFlights(timeoutMinutes: number = 25): CheckResult[] {
  // Flights in_flight for >25 min but <35 min (approaching stuck threshold)
  const db_ = db;
  const allFlights = db_.getStuckFlights(timeoutMinutes);
  const stuck = db_.getStuckFlights(35); // already stuck
  const stuckIds = new Set(stuck.map(f => f.id));

  return allFlights
    .filter(f => !stuckIds.has(f.id))
    .map((f) => ({
      issue: `Flight "${f.flight_id}" slow (in_flight for ${timeoutMinutes}+ minutes)`,
      severity: "warning" as const,
      entity_type: "flight" as const,
      entity_id: f.id,
      // Advisory only — no automatic remediation
    }));
}

/**
 * Check for scheduled swarms that are due for promotion.
 */
export function checkScheduledSwarms(): CheckResult[] {
  const scheduled = db.getScheduledSwarms();
  return scheduled.map((s) => ({
    issue: `Swarm #${s.swarm_number} scheduled and due for promotion`,
    severity: "warning" as const,
    entity_type: "swarm" as const,
    entity_id: s.id,
    remediation: "promoteScheduledSwarm",
  }));
}

/**
 * Check for bees with low success rate (advisory).
 */
export function checkLowPerformanceBees(): CheckResult[] {
  const lowPerf = db.getLowPerformanceBees(5, 0.5);
  return lowPerf.map((b) => ({
    issue: `Bee "${b.bee_id}" has low success rate: ${Math.round(b.success_rate * 100)}% (${b.successes}/${b.total_flights})`,
    severity: "warning" as const,
    entity_type: "flight" as const,
    entity_id: b.bee_id,
    // Advisory only — no automatic remediation
  }));
}

// ── Phase 14: Gate & Adaptive Checks ────────────────────────────────

/**
 * Check for gated flights that have exceeded their timeout_minutes.
 */
export function checkExpiredGates(): CheckResult[] {
  const gated = db.getGatedFlightsAll();
  const results: CheckResult[] = [];

  for (const f of gated) {
    if (!f.gate || !f.gated_at) continue;
    let policy;
    try {
      policy = typeof f.gate === "string" && f.gate !== "approval" ? JSON.parse(f.gate) : null;
    } catch {
      continue;
    }
    if (!policy || !policy.timeout_minutes) continue;

    const gatedTime = new Date(f.gated_at.replace(" ", "T") + "Z").getTime();
    const elapsedMinutes = (Date.now() - gatedTime) / (1000 * 60);
    if (elapsedMinutes >= policy.timeout_minutes) {
      results.push({
        issue: `Flight "${f.flight_id}" gate expired (${Math.round(elapsedMinutes)}/${policy.timeout_minutes} min)`,
        severity: "critical" as const,
        entity_type: "flight" as const,
        entity_id: f.id,
        remediation: "resolveExpiredGate",
      });
    }
  }

  return results;
}

/**
 * Advisory check: if adaptive tuning is enabled and sufficient data exists,
 * flag when recommendations are available.
 */
export function checkAdaptiveTuning(): CheckResult[] {
  const enabled = getConfigBoolean("adaptive_enabled", false);
  if (!enabled) return [];

  const blueprints = db.listBlueprints();
  const results: CheckResult[] = [];

  for (const bp of blueprints) {
    const completedCount = db.getCompletedSwarmCount(bp.id);
    if (completedCount < 10) continue;

    const beeStats = db.getBeeStatsForBlueprint(bp.id);
    const hasEnoughData = beeStats.some(s => s.total_flights >= 5);
    if (!hasEnoughData) continue;

    results.push({
      issue: `Blueprint "${bp.id}" has tuning recommendations available (${completedCount} swarms analyzed)`,
      severity: "warning" as const,
      entity_type: "swarm" as const,
      entity_id: bp.id,
      // Advisory only — no automatic remediation
    });
  }

  return results;
}

// ── Phase 12: Queue & Archive Checks ─────────────────────────────────

/**
 * Check for swarms queued for >60 minutes.
 */
export function checkQueuedSwarms(): CheckResult[] {
  const queued = db.getQueuedSwarms();
  const now = Date.now();
  const results: CheckResult[] = [];

  for (const s of queued) {
    const createdAt = new Date(s.created_at.replace(" ", "T") + "Z").getTime();
    const minutesQueued = (now - createdAt) / (1000 * 60);
    if (minutesQueued > 60) {
      results.push({
        issue: `Swarm #${s.swarm_number} queued for ${Math.round(minutesQueued)} minutes`,
        severity: "warning" as const,
        entity_type: "swarm" as const,
        entity_id: s.id,
        // Advisory only — user should increase concurrency or stop other swarms
      });
    }
  }

  return results;
}

/**
 * Check if auto-maintenance should run (auto_maintain=true, >24h since last).
 */
export function checkMaintenance(): CheckResult[] {
  const autoMaintain = getConfigBoolean("auto_maintain", false);
  if (!autoMaintain) return [];

  const lastMaintenance = db.getMetaValue("last_maintenance_at");
  if (lastMaintenance) {
    const lastAt = new Date(lastMaintenance.replace(" ", "T") + "Z").getTime();
    const hoursAgo = (Date.now() - lastAt) / (1000 * 60 * 60);
    if (hoursAgo < 24) return [];
  }

  return [{
    issue: "Auto-maintenance due (>24h since last run)",
    severity: "warning" as const,
    entity_type: "swarm" as const,
    entity_id: "maintenance",
    remediation: "autoMaintain",
  }];
}

/**
 * Check for buzzing swarms that exceeded budget but action=warn (advisory).
 */
export function checkBudgetOverruns(): CheckResult[] {
  const overruns = db.getBudgetExceededSwarms();
  return overruns.map((s) => ({
    issue: `Swarm #${s.swarm_number} exceeded token budget (${s.consumed}/${s.token_budget}) with action=warn`,
    severity: "warning" as const,
    entity_type: "swarm" as const,
    entity_id: s.id,
    // Advisory only — warn action means no automatic remediation
  }));
}

/**
 * Check for sub-swarm flights that have exceeded their timeout.
 */
export function checkSubSwarmTimeouts(): CheckResult[] {
  const subSwarmFlights = db.getSubSwarmFlights();
  const results: CheckResult[] = [];

  for (const f of subSwarmFlights) {
    if (!f.sub_swarm_config || !f.child_swarm_id) continue;
    let config;
    try {
      config = JSON.parse(f.sub_swarm_config);
    } catch {
      continue;
    }
    if (!config.timeout_minutes) continue;

    const startedAt = f.started_at ?? f.updated_at;
    const elapsed = (Date.now() - new Date(startedAt.replace(" ", "T") + "Z").getTime()) / (1000 * 60);
    if (elapsed >= config.timeout_minutes) {
      results.push({
        issue: `Sub-swarm flight "${f.flight_id}" timed out (${Math.round(elapsed)}/${config.timeout_minutes} min)`,
        severity: "critical" as const,
        entity_type: "flight" as const,
        entity_id: f.id,
        remediation: "timeoutSubSwarm",
      });
    }
  }

  return results;
}

/**
 * Check for unacknowledged critical anomaly alerts.
 */
export function checkCriticalAnomalies(): CheckResult[] {
  const alerts = db.getUnacknowledgedCriticalAlerts();
  return alerts.map((a) => ({
    issue: `Critical anomaly: ${a.metric} deviation of ${a.sigma_deviation}σ on flight "${a.flight_id}" (blueprint: ${a.blueprint_id})`,
    severity: "critical" as const,
    entity_type: "flight" as const,
    entity_id: a.id,
    // Advisory only — anomalies don't have automatic remediation
  }));
}

/**
 * Advisory check: flag expired cache entries for cleanup.
 */
export function checkExpiredCache(): CheckResult[] {
  const stats = db.getCacheStats();
  if (stats.expired === 0) return [];

  return [{
    issue: `${stats.expired} expired cache entries need cleanup`,
    severity: "warning" as const,
    entity_type: "swarm" as const,
    entity_id: "cache",
    remediation: "cleanExpiredCache",
  }];
}

/**
 * Check for old completed swarms that should be auto-archived.
 * Only active when auto_archive=true in global config.
 */
export function checkAutoArchive(): CheckResult[] {
  const autoArchive = getConfigBoolean("auto_archive", false);
  if (!autoArchive) return [];

  const retentionDays = getConfigNumber("retention_days", 30);
  const old = db.getOldCompletedSwarms(retentionDays);

  return old.map((s) => ({
    issue: `Swarm #${s.swarm_number} eligible for auto-archive (${s.status}, older than ${retentionDays} days)`,
    severity: "warning" as const,
    entity_type: "swarm" as const,
    entity_id: s.id,
    remediation: "autoArchiveSwarm",
  }));
}
