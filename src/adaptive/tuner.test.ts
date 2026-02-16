import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { analyzeTuning } from "./tuner.js";
import * as db from "../db.js";
import type { BlueprintSpec } from "../types.js";

describe("Adaptive Tuning", () => {
  beforeEach(() => {
    freshDb();
  });

  it("returns error for non-installed blueprint", () => {
    const result = analyzeTuning("nonexistent");
    expect(result.success).toBe(false);
  });

  it("returns no recommendations with insufficient data", () => {
    seedBlueprint();

    const result = analyzeTuning("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.report.recommendations).toEqual([]);
    expect(result.report.data_quality).toBe("insufficient");
    expect(result.report.analyzed_bees).toBe(0);
  });

  it("recommends lower timeout when avg is <30% of timeout", () => {
    const spec: BlueprintSpec = {
      ...MINIMAL_BLUEPRINT,
      bees: [
        { ...MINIMAL_BLUEPRINT.bees[0], timeout_seconds: 1000 },
      ],
    };
    seedBlueprint(spec);

    // Seed stats: avg duration 60s, timeout 1000s (6% of timeout)
    for (let i = 0; i < 10; i++) {
      db.upsertBeeStats("test-bp_worker", true, 60, 1000);
    }

    const result = analyzeTuning("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const timeoutRec = result.report.recommendations.find(r => r.parameter === "timeout_seconds");
    expect(timeoutRec).toBeDefined();
    expect(timeoutRec!.recommended_value).toBe(150); // 60 * 2.5
    expect(timeoutRec!.current_value).toBe(1000);
  });

  it("recommends higher timeout when avg is >80% of timeout", () => {
    const spec: BlueprintSpec = {
      ...MINIMAL_BLUEPRINT,
      bees: [
        { ...MINIMAL_BLUEPRINT.bees[0], timeout_seconds: 100 },
      ],
    };
    seedBlueprint(spec);

    // Seed stats: avg duration 90s, timeout 100s (90% of timeout)
    for (let i = 0; i < 10; i++) {
      db.upsertBeeStats("test-bp_worker", true, 90, 1000);
    }

    const result = analyzeTuning("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const timeoutRec = result.report.recommendations.find(r => r.parameter === "timeout_seconds");
    expect(timeoutRec).toBeDefined();
    expect(timeoutRec!.recommended_value).toBe(180); // 90 * 2
  });

  it("recommends reducing retries for high success rate", () => {
    seedBlueprint();

    // High success rate with default max_retries=2
    for (let i = 0; i < 20; i++) {
      db.upsertBeeStats("test-bp_worker", true, 60, 1000);
    }

    const result = analyzeTuning("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const retryRec = result.report.recommendations.find(r => r.parameter === "max_retries");
    expect(retryRec).toBeDefined();
    expect(retryRec!.recommended_value).toBe(1);
  });

  it("recommends increasing retries for low success rate", () => {
    seedBlueprint();

    // Low success rate
    for (let i = 0; i < 10; i++) {
      db.upsertBeeStats("test-bp_worker", i < 3, 60, 1000);
    }

    const result = analyzeTuning("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const retryRec = result.report.recommendations.find(r => r.parameter === "max_retries");
    expect(retryRec).toBeDefined();
    expect(retryRec!.recommended_value).toBe(4); // min(5, 2 + 2)
  });

  it("applies recommendations when apply=true", () => {
    const spec: BlueprintSpec = {
      ...MINIMAL_BLUEPRINT,
      bees: [
        { ...MINIMAL_BLUEPRINT.bees[0], timeout_seconds: 1000 },
      ],
    };
    seedBlueprint(spec);

    for (let i = 0; i < 10; i++) {
      db.upsertBeeStats("test-bp_worker", true, 60, 1000);
    }

    const result = analyzeTuning("test-bp", true);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.report.applied).toBe(true);

    // Verify blueprint was updated in DB
    const updated = db.getBlueprint("test-bp");
    expect(updated).toBeDefined();
    const updatedSpec = JSON.parse(updated!.spec) as BlueprintSpec;
    expect(updatedSpec.bees[0].timeout_seconds).toBe(150);

    // Verify version was recorded
    const versions = db.getBlueprintVersions("test-bp");
    expect(versions.length).toBeGreaterThan(0);
  });

  it("reports correct data quality", () => {
    seedBlueprint();

    // 25 flights = "good" quality
    for (let i = 0; i < 25; i++) {
      db.upsertBeeStats("test-bp_worker", true, 60, 1000);
    }

    const result = analyzeTuning("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.report.data_quality).toBe("good");
  });
});
