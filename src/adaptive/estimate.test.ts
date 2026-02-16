import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT, DAG_BLUEPRINT, LOOP_BLUEPRINT } from "../test/helpers.js";
import { estimateSwarm } from "./estimate.js";
import * as db from "../db.js";
import type { BlueprintSpec } from "../types.js";

describe("Swarm Estimation", () => {
  beforeEach(() => {
    freshDb();
  });

  it("returns error for non-installed blueprint", () => {
    const result = estimateSwarm("nonexistent");
    expect(result.success).toBe(false);
  });

  it("returns defaults when no historical data", () => {
    seedBlueprint();
    const result = estimateSwarm("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.estimate.blueprint_id).toBe("test-bp");
    expect(result.estimate.historical_swarms_analyzed).toBe(0);
    expect(result.estimate.overall_confidence).toBe(0);
    expect(result.estimate.note).toContain("No historical data");
    expect(result.estimate.per_flight.length).toBe(1);

    // Default values
    expect(result.estimate.per_flight[0].estimated_duration_seconds).toBe(300);
    expect(result.estimate.per_flight[0].estimated_tokens).toBe(5000);
  });

  it("uses bee_stats when available", () => {
    seedBlueprint();

    // Seed bee stats
    db.upsertBeeStats("test-bp_worker", true, 120, 3000);
    for (let i = 0; i < 9; i++) {
      db.upsertBeeStats("test-bp_worker", true, 120, 3000);
    }

    const result = estimateSwarm("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flight = result.estimate.per_flight[0];
    expect(flight.confidence).toBe(1.0); // 10 flights / 10 = 1.0
    expect(flight.estimated_duration_seconds).toBe(120);
    expect(flight.estimated_tokens).toBe(3000);
  });

  it("computes critical path for DAG blueprints", () => {
    seedBlueprint(DAG_BLUEPRINT);

    const result = estimateSwarm("test-dag");
    expect(result.success).toBe(true);
    if (!result.success) return;

    // DAG: decompose -> implement -> (test | lint) -> finalize
    // With defaults (300s each): critical path = 300 + 300 + 300 + 300 = 1200
    expect(result.estimate.total_estimated_duration_seconds).toBe(1200);
  });

  it("multiplies loop flights by median cell count", () => {
    seedBlueprint(LOOP_BLUEPRINT);

    // Create some historical swarms with cells to get a median
    const swarm1 = db.createSwarm("test-loop", "task1");
    for (let i = 0; i < 5; i++) {
      db.insertCell(swarm1.id, i, `cell-${i}`, `Cell ${i}`, "desc", ["criteria"]);
    }
    db.updateSwarm(swarm1.id, { status: "completed" });

    const result = estimateSwarm("test-loop");
    expect(result.success).toBe(true);
    if (!result.success) return;

    // The loop flight should have estimated_cells = 5 (from historical)
    const loopFlight = result.estimate.per_flight.find(f => f.type === "loop");
    expect(loopFlight).toBeDefined();
    expect(loopFlight!.estimated_cells).toBe(5);
  });

  it("returns success rate from per-blueprint stats", () => {
    seedBlueprint();

    // Create some completed and failed swarms
    const s1 = db.createSwarm("test-bp", "task1");
    db.updateSwarm(s1.id, { status: "completed" });
    const s2 = db.createSwarm("test-bp", "task2");
    db.updateSwarm(s2.id, { status: "completed" });
    const s3 = db.createSwarm("test-bp", "task3");
    db.updateSwarm(s3.id, { status: "failed" });

    const result = estimateSwarm("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    // 2 completed out of 3 terminal = 0.667
    expect(result.estimate.estimated_success_rate).toBeCloseTo(0.667, 1);
  });
});
