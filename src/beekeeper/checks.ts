import * as db from "../db.js";
import { scheduler } from "../pollinator/scheduler.js";
import type { CheckResult } from "../types.js";
import type { ResolvedThresholds } from "./config.js";

/**
 * Check for flights stuck in "in_flight" status beyond timeout.
 */
export function checkStuckFlights(timeoutMinutes: number = 35): CheckResult[] {
  const stuck = db.getStuckFlights(timeoutMinutes);
  return stuck.map((f) => {
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
