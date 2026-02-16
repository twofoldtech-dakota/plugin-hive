import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import { scheduler } from "../pollinator/scheduler.js";
import { resolveBeekeeperThresholds } from "./config.js";
import {
  checkStuckFlights,
  checkStalledSwarms,
  checkZombieSwarms,
  checkOrphanedSchedulers,
  checkExhaustedRetries,
  checkVerificationLoops,
  checkStuckCells,
  checkSlowFlights,
  checkFailedWebhooks,
  checkScheduledSwarms,
  checkLowPerformanceBees,
  checkQueuedSwarms,
  checkAutoArchive,
  checkMaintenance,
  checkExpiredGates,
  checkAdaptiveTuning,
  checkBudgetOverruns,
  checkExpiredCache,
} from "./checks.js";
import {
  resetStuckFlight,
  advanceStalledSwarm,
  resolveZombieSwarm,
  stopOrphanedScheduler,
  failExhaustedFlight,
  forcePassCell,
  resetStuckCell,
  retryWebhook,
  autoArchiveSwarm,
  autoMaintain,
  resolveExpiredGate,
  cleanExpiredCache,
} from "./remediate.js";
import { emitEvent } from "../lib/events.js";
import type { CheckResult, BeekeeperReport, BlueprintSpec } from "../types.js";

function promoteScheduledSwarm(swarmId: string): { success: boolean } {
  const swarm = db.getSwarm(swarmId);
  if (!swarm || swarm.status !== "scheduled") return { success: false };
  db.updateSwarm(swarmId, { status: "buzzing" });
  db.bumpEpoch();
  emitEvent({ eventType: "swarm.promoted", swarmId, payload: { schedule_at: swarm.schedule_at } });

  // Register with scheduler
  const bp = db.getBlueprint(swarm.blueprint_id);
  if (bp) {
    const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
    if (spec) scheduler.registerSwarm(swarmId, spec);
  }

  logger.info("Scheduled swarm promoted", { swarmId, swarmNumber: swarm.swarm_number });
  return { success: true };
}

const remediationMap: Record<string, (entityId: string) => { success: boolean }> = {
  resetStuckFlight,
  advanceStalledSwarm,
  resolveZombieSwarm,
  stopOrphanedScheduler,
  failExhaustedFlight,
  forcePassCell,
  resetStuckCell,
  retryWebhook,
  promoteScheduledSwarm,
  autoArchiveSwarm,
  autoMaintain,
  resolveExpiredGate,
  cleanExpiredCache,
};

/**
 * Run all beekeeper checks, auto-remediate where possible, and return a report.
 */
export function runBeekeeperCheck(): BeekeeperReport {
  const allResults: CheckResult[] = [
    ...checkStuckFlights(),
    ...checkStalledSwarms(),
    ...checkZombieSwarms(),
    ...checkOrphanedSchedulers(),
    ...checkExhaustedRetries(),
    ...checkSlowFlights(),
    ...checkFailedWebhooks(),
    ...checkScheduledSwarms(),
    ...checkLowPerformanceBees(),
    ...checkQueuedSwarms(),
    ...checkAutoArchive(),
    ...checkMaintenance(),
    ...checkExpiredGates(),
    ...checkAdaptiveTuning(),
    ...checkBudgetOverruns(),
    ...checkExpiredCache(),
  ];

  // Per-swarm checks (verification loops, stuck cells)
  const buzzingSwarms = db.listSwarms({ status: "buzzing" });
  for (const swarm of buzzingSwarms) {
    const bp = db.getBlueprint(swarm.blueprint_id);
    const spec = bp ? safeJsonParse<BlueprintSpec | null>(bp.spec, null) : null;
    const thresholds = resolveBeekeeperThresholds(spec?.beekeeper);

    allResults.push(
      ...checkVerificationLoops(swarm.id, thresholds),
      ...checkStuckCells(swarm.id, thresholds),
    );
  }

  let actionsTaken = 0;
  const findings: string[] = [];

  for (const result of allResults) {
    if (result.remediation) {
      const handler = remediationMap[result.remediation];
      if (handler) {
        const outcome = handler(result.entity_id);
        if (outcome.success) actionsTaken++;
      }
    }
    findings.push(result.issue);
  }

  const summary =
    allResults.length === 0
      ? "Hive is healthy. All bees buzzing normally."
      : `Found ${allResults.length} issue(s), took ${actionsTaken} action(s).`;

  db.insertBeekeeperCheck(allResults.length, actionsTaken, summary, { findings });
  logger.info("Beekeeper check completed", { issuesFound: allResults.length, actionsTaken });

  return {
    summary,
    issues_found: allResults.length,
    actions_taken: actionsTaken,
    findings,
  };
}
