import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
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
} from "./checks.js";
import {
  resetStuckFlight,
  advanceStalledSwarm,
  resolveZombieSwarm,
  stopOrphanedScheduler,
  failExhaustedFlight,
  forcePassCell,
  resetStuckCell,
} from "./remediate.js";
import type { CheckResult, BeekeeperReport, BlueprintSpec } from "../types.js";

const remediationMap: Record<string, (entityId: string) => { success: boolean }> = {
  resetStuckFlight,
  advanceStalledSwarm,
  resolveZombieSwarm,
  stopOrphanedScheduler,
  failExhaustedFlight,
  forcePassCell,
  resetStuckCell,
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
