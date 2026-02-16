import * as db from "../db.js";
import { getConfigNumber } from "../config/global.js";

export interface QueueStatus {
  global: {
    max_concurrent_swarms: number;
    buzzing_swarms: number;
    queued_swarms: number;
    utilization: string; // "3/5 (60%)"
  };
  per_blueprint: Array<{
    blueprint_id: string;
    buzzing: number;
    queued: number;
  }>;
  active_flights_per_bee: Array<{
    bee_id: string;
    in_flight: number;
  }>;
  queue: Array<{
    swarm_number: number;
    swarm_id: string;
    blueprint_id: string;
    task: string;
    priority: number;
    queued_at: string;
  }>;
}

/**
 * Get queue status: global utilization, per-blueprint breakdown, active flights per bee, queue contents.
 */
export function getQueueStatus(): QueueStatus {
  const globalMax = getConfigNumber("max_concurrent_swarms", 5);
  const buzzingCount = db.countBuzzingSwarms();
  const queuedSwarms = db.getQueuedSwarms();

  const pct = globalMax > 0 ? Math.round((buzzingCount / globalMax) * 100) : 0;
  const utilizationStr = globalMax > 0
    ? `${buzzingCount}/${globalMax} (${pct}%)`
    : `${buzzingCount}/unlimited`;

  // Per-blueprint breakdown
  const blueprintMap = new Map<string, { buzzing: number; queued: number }>();
  const buzzingSwarms = db.listSwarms({ status: "buzzing" });
  for (const s of buzzingSwarms) {
    const entry = blueprintMap.get(s.blueprint_id) ?? { buzzing: 0, queued: 0 };
    entry.buzzing++;
    blueprintMap.set(s.blueprint_id, entry);
  }
  for (const s of queuedSwarms) {
    const entry = blueprintMap.get(s.blueprint_id) ?? { buzzing: 0, queued: 0 };
    entry.queued++;
    blueprintMap.set(s.blueprint_id, entry);
  }

  const perBlueprint = Array.from(blueprintMap.entries()).map(([id, counts]) => ({
    blueprint_id: id,
    ...counts,
  }));

  // Active flights per bee (from buzzing swarms)
  const beeFlightMap = new Map<string, number>();
  for (const swarm of buzzingSwarms) {
    const flights = db.getFlightsForSwarm(swarm.id);
    for (const f of flights) {
      if (f.status === "in_flight") {
        beeFlightMap.set(f.bee_id, (beeFlightMap.get(f.bee_id) ?? 0) + 1);
      }
    }
  }

  const activeFlightsPerBee = Array.from(beeFlightMap.entries())
    .map(([bee_id, count]) => ({ bee_id, in_flight: count }))
    .sort((a, b) => b.in_flight - a.in_flight);

  // Queue contents
  const queue = queuedSwarms.map(s => ({
    swarm_number: s.swarm_number,
    swarm_id: s.id,
    blueprint_id: s.blueprint_id,
    task: s.task,
    priority: s.priority,
    queued_at: s.created_at,
  }));

  return {
    global: {
      max_concurrent_swarms: globalMax,
      buzzing_swarms: buzzingCount,
      queued_swarms: queuedSwarms.length,
      utilization: utilizationStr,
    },
    per_blueprint: perBlueprint,
    active_flights_per_bee: activeFlightsPerBee,
    queue,
  };
}
