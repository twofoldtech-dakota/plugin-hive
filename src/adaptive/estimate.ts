import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import type { BlueprintSpec, FlightEstimate, SwarmEstimate, BeeStatsRecord, FlightSpec } from "../types.js";

const DEFAULT_DURATION = 300;
const DEFAULT_TOKENS = 5000;

/**
 * Estimate cost and duration for a swarm before starting it.
 * Uses historical bee_stats and fleet_metrics data.
 */
export function estimateSwarm(
  blueprintId: string,
  _variables?: Record<string, string>,
): { success: true; estimate: SwarmEstimate } | { success: false; error: string } {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" not found. Install it first.` };
  }

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) {
    return { success: false, error: "Failed to parse blueprint spec" };
  }

  // Get historical data
  const historicalCellCounts = db.getHistoricalCellCounts(blueprintId);
  const completedCount = db.getCompletedSwarmCount(blueprintId);
  const beeStatsMap = new Map<string, BeeStatsRecord>();
  for (const bee of spec.bees) {
    const qualifiedId = `${blueprintId}_${bee.id}`;
    const stats = db.getBeeStats(qualifiedId);
    if (stats) beeStatsMap.set(bee.id, stats);
  }

  // Median cell count from history
  const medianCells = historicalCellCounts.length > 0
    ? median(historicalCellCounts)
    : 3; // fallback

  // Collect verify_flight template IDs
  const verifyFlightIds = new Set<string>();
  for (const flight of spec.flights) {
    if (flight.type === "loop" && flight.loop?.verify_each && flight.loop?.verify_flight) {
      verifyFlightIds.add(flight.loop.verify_flight);
    }
  }

  // Per-flight estimates
  const perFlight: FlightEstimate[] = [];
  const pipelineFlights = spec.flights.filter(f => !verifyFlightIds.has(f.id));

  for (const flight of pipelineFlights) {
    const stats = beeStatsMap.get(flight.bee);
    const dataPoints = stats?.total_flights ?? 0;
    const confidence = Math.min(1.0, dataPoints / 10);

    const avgDuration = stats ? stats.avg_duration_seconds : DEFAULT_DURATION;
    const avgTokens = stats && stats.total_flights > 0
      ? Math.round(stats.total_tokens / stats.total_flights)
      : DEFAULT_TOKENS;

    let estimatedDuration = avgDuration;
    let estimatedTokens = avgTokens;
    let estimatedCells: number | null = null;

    // Loop flights: multiply by median cell count
    if (flight.type === "loop") {
      estimatedCells = medianCells;
      estimatedDuration = avgDuration * medianCells;
      estimatedTokens = avgTokens * medianCells;

      // If verify_each, add verification overhead
      if (flight.loop?.verify_each && flight.loop?.verify_flight) {
        const verifyFlight = spec.flights.find(f => f.id === flight.loop!.verify_flight);
        if (verifyFlight) {
          const verifyStats = beeStatsMap.get(verifyFlight.bee);
          const verifyDuration = verifyStats ? verifyStats.avg_duration_seconds : DEFAULT_DURATION;
          const verifyTokens = verifyStats && verifyStats.total_flights > 0
            ? Math.round(verifyStats.total_tokens / verifyStats.total_flights)
            : DEFAULT_TOKENS;
          estimatedDuration += verifyDuration * medianCells;
          estimatedTokens += verifyTokens * medianCells;
        }
      }
    }

    perFlight.push({
      flight_id: flight.id,
      bee_id: flight.bee,
      type: flight.type,
      estimated_duration_seconds: Math.round(estimatedDuration),
      estimated_tokens: Math.round(estimatedTokens),
      estimated_cells: estimatedCells,
      confidence,
      data_points: dataPoints,
    });
  }

  // DAG critical path analysis
  const isDAG = pipelineFlights.some(f => f.depends_on && f.depends_on.length > 0);
  let totalDuration: number;

  if (isDAG) {
    totalDuration = computeCriticalPath(pipelineFlights, perFlight);
  } else {
    // Sequential: sum of all durations
    totalDuration = perFlight.reduce((sum, f) => sum + f.estimated_duration_seconds, 0);
  }

  const totalTokens = perFlight.reduce((sum, f) => sum + f.estimated_tokens, 0);

  // Weighted average confidence
  const totalDataPoints = perFlight.reduce((sum, f) => sum + f.data_points, 0);
  const overallConfidence = totalDataPoints > 0
    ? perFlight.reduce((sum, f) => sum + f.confidence * f.data_points, 0) / totalDataPoints
    : 0;

  // Success rate from per-blueprint stats
  const bpStats = db.getPerBlueprintStats();
  const thisBp = bpStats.find(s => s.blueprint_id === blueprintId);
  const successRate = thisBp && thisBp.swarms > 0
    ? Math.round((thisBp.completed / thisBp.swarms) * 1000) / 1000
    : null;

  const note = completedCount === 0
    ? "No historical data — estimates use defaults (300s, 5000 tokens per flight)"
    : null;

  return {
    success: true,
    estimate: {
      blueprint_id: blueprintId,
      total_estimated_duration_seconds: Math.round(totalDuration),
      total_estimated_tokens: totalTokens,
      overall_confidence: Math.round(overallConfidence * 1000) / 1000,
      estimated_success_rate: successRate,
      per_flight: perFlight,
      historical_swarms_analyzed: completedCount,
      note,
    },
  };
}

/**
 * Compute critical path through a DAG of flights.
 * Returns the longest path duration.
 */
function computeCriticalPath(
  flights: FlightSpec[],
  estimates: FlightEstimate[],
): number {
  const durationMap = new Map<string, number>();
  for (const est of estimates) {
    durationMap.set(est.flight_id, est.estimated_duration_seconds);
  }

  // Longest path from each node
  const memo = new Map<string, number>();

  function longestPath(flightId: string): number {
    if (memo.has(flightId)) return memo.get(flightId)!;

    const flight = flights.find(f => f.id === flightId);
    if (!flight) return 0;

    const selfDuration = durationMap.get(flightId) ?? DEFAULT_DURATION;
    const deps = flight.depends_on ?? [];

    if (deps.length === 0) {
      memo.set(flightId, selfDuration);
      return selfDuration;
    }

    const maxDepPath = Math.max(...deps.map(d => longestPath(d)));
    const total = maxDepPath + selfDuration;
    memo.set(flightId, total);
    return total;
  }

  let criticalPath = 0;
  for (const flight of flights) {
    const path = longestPath(flight.id);
    if (path > criticalPath) criticalPath = path;
  }

  return criticalPath;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
