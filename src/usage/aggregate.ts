import * as db from "../db.js";

export interface UsageBreakdown {
  swarm_id: string;
  totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_count: number;
    actual_count: number;
  };
  by_bee: Record<string, { input_tokens: number; output_tokens: number; total_tokens: number; flights: number }>;
  by_flight: Array<{
    flight_id: string;
    bee_id: string;
    input_tokens: number;
    output_tokens: number;
    estimated: boolean;
  }>;
}

export type GetUsageResult =
  | { success: true; data: UsageBreakdown }
  | { success: false; error: string };

/**
 * Aggregate token usage for a swarm — per-bee, per-flight, and totals.
 */
export function getSwarmUsage(swarmId: string): GetUsageResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  const usageRecords = db.getUsageForSwarm(swarmId);

  let totalInput = 0;
  let totalOutput = 0;
  let estimatedCount = 0;
  let actualCount = 0;

  const byBee: Record<string, { input_tokens: number; output_tokens: number; total_tokens: number; flights: number }> = {};
  const byFlight: UsageBreakdown["by_flight"] = [];

  for (const u of usageRecords) {
    totalInput += u.input_tokens;
    totalOutput += u.output_tokens;
    if (u.estimated) {
      estimatedCount++;
    } else {
      actualCount++;
    }

    if (!byBee[u.bee_id]) {
      byBee[u.bee_id] = { input_tokens: 0, output_tokens: 0, total_tokens: 0, flights: 0 };
    }
    byBee[u.bee_id].input_tokens += u.input_tokens;
    byBee[u.bee_id].output_tokens += u.output_tokens;
    byBee[u.bee_id].total_tokens += u.input_tokens + u.output_tokens;
    byBee[u.bee_id].flights++;

    byFlight.push({
      flight_id: u.flight_id,
      bee_id: u.bee_id,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      estimated: !!u.estimated,
    });
  }

  return {
    success: true,
    data: {
      swarm_id: swarmId,
      totals: {
        input_tokens: totalInput,
        output_tokens: totalOutput,
        total_tokens: totalInput + totalOutput,
        estimated_count: estimatedCount,
        actual_count: actualCount,
      },
      by_bee: byBee,
      by_flight: byFlight,
    },
  };
}
