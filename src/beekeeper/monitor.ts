import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import {
  checkStuckFlights,
  checkStalledSwarms,
  checkZombieSwarms,
  checkOrphanedSchedulers,
  checkExhaustedRetries,
} from "./checks.js";
import {
  resetStuckFlight,
  advanceStalledSwarm,
  resolveZombieSwarm,
  stopOrphanedScheduler,
  failExhaustedFlight,
} from "./remediate.js";
import type { CheckResult, BeekeeperReport } from "../types.js";

const remediationMap: Record<string, (entityId: string) => { success: boolean }> = {
  resetStuckFlight,
  advanceStalledSwarm,
  resolveZombieSwarm,
  stopOrphanedScheduler,
  failExhaustedFlight,
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
  ];

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
