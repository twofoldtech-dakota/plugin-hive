import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT, TRIGGER_BLUEPRINT, DAG_BLUEPRINT } from "../test/helpers.js";
import { dryRunBlueprint } from "./dryrun.js";

beforeEach(() => {
  freshDb();
});

describe("dryRunBlueprint", () => {
  it("returns success:false if blueprint is not installed", () => {
    const result = dryRunBlueprint("nonexistent-bp");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not installed");
    }
  });

  it("returns correct data for MINIMAL_BLUEPRINT (1 flight, sequential)", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);
    const result = dryRunBlueprint("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.blueprint_id).toBe("test-bp");
    expect(result.data.mode).toBe("sequential");
    expect(result.data.total_flights).toBe(1);
    expect(result.data.gated_flights).toBe(0);
    expect(result.data.conditional_flights).toBe(0);
    expect(result.data.flight_order).toHaveLength(1);
    expect(result.data.flight_order[0].id).toBe("do-work");
    expect(result.data.flight_order[0].bee).toBe("worker");
    expect(result.data.flight_order[0].type).toBe("single");
    expect(result.data.flight_order[0].order).toBe(1);
  });

  it("returns correct data for DAG_BLUEPRINT (dag mode, verify template excluded)", () => {
    seedBlueprint(DAG_BLUEPRINT);
    const result = dryRunBlueprint("test-dag");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.blueprint_id).toBe("test-dag");
    expect(result.data.mode).toBe("dag");
    // DAG_BLUEPRINT has 5 flights: decompose, implement, test, lint, finalize
    // None are verify_flight templates, so all 5 should appear
    expect(result.data.total_flights).toBe(5);
    expect(result.data.gated_flights).toBe(0);
    expect(result.data.conditional_flights).toBe(0);

    const flightIds = result.data.flight_order.map(f => f.id);
    expect(flightIds).toContain("decompose");
    expect(flightIds).toContain("implement");
    expect(flightIds).toContain("test");
    expect(flightIds).toContain("lint");
    expect(flightIds).toContain("finalize");
  });

  it("topologically orders DAG flights so dependencies come first", () => {
    seedBlueprint(DAG_BLUEPRINT);
    const result = dryRunBlueprint("test-dag");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const orderMap = new Map(result.data.flight_order.map(f => [f.id, f.order]));
    // decompose has no deps, should come before implement
    expect(orderMap.get("decompose")!).toBeLessThan(orderMap.get("implement")!);
    // implement must come before test and lint
    expect(orderMap.get("implement")!).toBeLessThan(orderMap.get("test")!);
    expect(orderMap.get("implement")!).toBeLessThan(orderMap.get("lint")!);
    // test and lint must come before finalize
    expect(orderMap.get("test")!).toBeLessThan(orderMap.get("finalize")!);
    expect(orderMap.get("lint")!).toBeLessThan(orderMap.get("finalize")!);
  });

  it("includes depends_on in DAG flight entries", () => {
    seedBlueprint(DAG_BLUEPRINT);
    const result = dryRunBlueprint("test-dag");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const finalize = result.data.flight_order.find(f => f.id === "finalize");
    expect(finalize).toBeDefined();
    expect(finalize!.depends_on).toContain("test");
    expect(finalize!.depends_on).toContain("lint");

    const decompose = result.data.flight_order.find(f => f.id === "decompose");
    expect(decompose!.depends_on).toBeUndefined();
  });

  it("resolves template variables with provided variables", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);
    const result = dryRunBlueprint("test-bp", { task: "Build auth module" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flight = result.data.flight_order[0];
    expect(flight.resolved_input_preview).toContain("Build auth module");
  });

  it("uses placeholder when variables are not provided", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);
    const result = dryRunBlueprint("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flight = result.data.flight_order[0];
    // Without variables, task resolves to the default "<task>" placeholder
    expect(flight.resolved_input_preview).toContain("<task>");
  });

  it("returns correct data for TRIGGER_BLUEPRINT", () => {
    seedBlueprint(TRIGGER_BLUEPRINT);
    const result = dryRunBlueprint("test-trigger");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.blueprint_id).toBe("test-trigger");
    expect(result.data.mode).toBe("sequential");
    expect(result.data.total_flights).toBe(1);
  });

  it("sets would_skip to false for all flights (without nectar values)", () => {
    seedBlueprint(DAG_BLUEPRINT);
    const result = dryRunBlueprint("test-dag");
    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const flight of result.data.flight_order) {
      expect(flight.would_skip).toBe(false);
    }
  });

  it("includes expects field in each flight entry", () => {
    seedBlueprint(MINIMAL_BLUEPRINT);
    const result = dryRunBlueprint("test-bp");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.flight_order[0].expects).toBe("STATUS: done");
  });
});
