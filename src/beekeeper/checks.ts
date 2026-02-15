import * as db from "../db.js";
import { scheduler } from "../pollinator/scheduler.js";
import type { CheckResult } from "../types.js";

/**
 * Check for flights stuck in "in_flight" status beyond timeout.
 */
export function checkStuckFlights(timeoutMinutes: number = 35): CheckResult[] {
  const stuck = db.getStuckFlights(timeoutMinutes);
  return stuck.map((f) => ({
    issue: `Flight "${f.flight_id}" stuck in_flight for ${timeoutMinutes}+ minutes`,
    severity: "warning" as const,
    entity_type: "flight" as const,
    entity_id: f.id,
    remediation: "resetStuckFlight",
  }));
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
