import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { recordVersion } from "../blueprint/version.js";
import type { BlueprintSpec, BeeStatsRecord, TuningRecommendation, TuningReport } from "../types.js";

const MIN_FLIGHTS = 5;

/**
 * Analyze bee performance and recommend parameter adjustments.
 * Optionally apply recommendations to the blueprint.
 */
export function analyzeTuning(
  blueprintId: string,
  apply: boolean = false,
): { success: true; report: TuningReport } | { success: false; error: string } {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" not found` };
  }

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) {
    return { success: false, error: "Failed to parse blueprint spec" };
  }

  const beeStats = db.getBeeStatsForBlueprint(blueprintId);
  const recommendations: TuningRecommendation[] = [];
  let analyzedBees = 0;

  for (const bee of spec.bees) {
    const qualifiedId = `${blueprintId}_${bee.id}`;
    const stats = beeStats.find(s => s.bee_id === qualifiedId);
    if (!stats || stats.total_flights < MIN_FLIGHTS) continue;

    analyzedBees++;
    const beeRecs = analyzeBee(bee, stats, spec);
    recommendations.push(...beeRecs);
  }

  const dataQuality = getDataQuality(beeStats);

  if (apply && recommendations.length > 0) {
    const mutatedSpec = applyRecommendations(spec, recommendations);
    db.insertBlueprint(blueprintId, mutatedSpec.name ?? null, mutatedSpec.version ?? null, JSON.stringify(mutatedSpec));
    recordVersion(blueprintId, mutatedSpec);
  }

  return {
    success: true,
    report: {
      blueprint_id: blueprintId,
      recommendations,
      analyzed_bees: analyzedBees,
      data_quality: dataQuality,
      applied: apply && recommendations.length > 0,
    },
  };
}

function analyzeBee(
  bee: { id: string; timeout_seconds?: number },
  stats: BeeStatsRecord,
  spec: BlueprintSpec,
): TuningRecommendation[] {
  const recs: TuningRecommendation[] = [];
  const qualifiedId = stats.bee_id;
  const confidence = Math.min(1.0, stats.total_flights / 50);

  // Timeout analysis
  const currentTimeout = bee.timeout_seconds ?? 300; // default 5 min
  const avgDuration = stats.avg_duration_seconds;

  if (avgDuration < currentTimeout * 0.3) {
    // Avg < 30% of timeout: timeout is too generous
    const recommended = Math.round(avgDuration * 2.5);
    if (recommended < currentTimeout) {
      recs.push({
        bee_id: qualifiedId,
        parameter: "timeout_seconds",
        current_value: currentTimeout,
        recommended_value: recommended,
        reasoning: `Avg duration (${Math.round(avgDuration)}s) is <30% of timeout (${currentTimeout}s). Recommend 2.5x avg.`,
        confidence,
      });
    }
  } else if (avgDuration > currentTimeout * 0.8) {
    // Avg > 80% of timeout: timeout is too tight
    const recommended = Math.round(avgDuration * 2);
    recs.push({
      bee_id: qualifiedId,
      parameter: "timeout_seconds",
      current_value: currentTimeout,
      recommended_value: recommended,
      reasoning: `Avg duration (${Math.round(avgDuration)}s) is >80% of timeout (${currentTimeout}s). Recommend 2x avg.`,
      confidence,
    });
  }

  // Retry analysis — look at all flights for this bee in the spec
  for (const flight of spec.flights) {
    if (flight.bee !== bee.id) continue;

    if (stats.success_rate > 0.95 && flight.max_retries > 1) {
      recs.push({
        bee_id: qualifiedId,
        parameter: "max_retries",
        current_value: flight.max_retries,
        recommended_value: 1,
        reasoning: `Success rate is ${Math.round(stats.success_rate * 100)}% — retries rarely needed. Reduce from ${flight.max_retries} to 1.`,
        confidence,
      });
    } else if (stats.success_rate < 0.5 && flight.max_retries < 5) {
      const recommended = Math.min(5, flight.max_retries + 2);
      recs.push({
        bee_id: qualifiedId,
        parameter: "max_retries",
        current_value: flight.max_retries,
        recommended_value: recommended,
        reasoning: `Success rate is ${Math.round(stats.success_rate * 100)}% — needs more retries. Increase from ${flight.max_retries} to ${recommended}.`,
        confidence,
      });
    }
  }

  return recs;
}

function applyRecommendations(spec: BlueprintSpec, recommendations: TuningRecommendation[]): BlueprintSpec {
  const mutated = JSON.parse(JSON.stringify(spec)) as BlueprintSpec;

  for (const rec of recommendations) {
    // Extract bee id from qualified id (blueprintId_beeId)
    const beeId = rec.bee_id.split("_").slice(1).join("_");

    if (rec.parameter === "timeout_seconds") {
      const bee = mutated.bees.find(b => b.id === beeId);
      if (bee) {
        bee.timeout_seconds = rec.recommended_value;
      }
    }

    if (rec.parameter === "max_retries") {
      for (const flight of mutated.flights) {
        if (flight.bee === beeId) {
          flight.max_retries = rec.recommended_value;
        }
      }
    }
  }

  return mutated;
}

function getDataQuality(beeStats: BeeStatsRecord[]): "insufficient" | "limited" | "good" | "excellent" {
  if (beeStats.length === 0) return "insufficient";
  const maxFlights = Math.max(...beeStats.map(s => s.total_flights));
  if (maxFlights < 5) return "insufficient";
  if (maxFlights < 20) return "limited";
  if (maxFlights < 50) return "good";
  return "excellent";
}
