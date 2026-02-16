import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { compareSwarms } from "./compare.js";
import * as db from "../db.js";

describe("Swarm Comparison", () => {
  beforeEach(() => {
    freshDb();
  });

  it("compares two swarms with matching flights", () => {
    const { swarm: swarmA } = seedSwarm();
    const { swarm: swarmB } = seedSwarm(MINIMAL_BLUEPRINT, "Test task 2");

    const result = compareSwarms(swarmA.id, swarmB.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.comparison.swarm_a.id).toBe(swarmA.id);
    expect(result.comparison.swarm_b.id).toBe(swarmB.id);
    expect(result.comparison.flights.length).toBe(1);
    expect(result.comparison.flights[0].flight_id).toBe("do-work");
    expect(result.comparison.flights[0].status_match).toBe(true);
  });

  it("detects status differences between flights", () => {
    const { swarm: swarmA, flights: flightsA } = seedSwarm();
    const { swarm: swarmB, flights: flightsB } = seedSwarm(MINIMAL_BLUEPRINT, "Test task 2");

    // Complete flight A but not B
    db.updateFlight(flightsA[0].id, { status: "done", output: "STATUS: done" });
    db.updateFlight(flightsB[0].id, { status: "failed", output: "ERROR: failed" });

    const result = compareSwarms(swarmA.id, swarmB.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.comparison.flights[0].status_match).toBe(false);
    expect(result.comparison.flights[0].a_status).toBe("done");
    expect(result.comparison.flights[0].b_status).toBe("failed");
    expect(result.comparison.summary.flights_differ).toBe(1);
  });

  it("generates markdown report", () => {
    const { swarm: swarmA } = seedSwarm();
    const { swarm: swarmB } = seedSwarm(MINIMAL_BLUEPRINT, "Test task 2");

    const result = compareSwarms(swarmA.id, swarmB.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.comparison.markdown).toContain("# Swarm Comparison");
    expect(result.comparison.markdown).toContain("Flights");
  });

  it("detects nectar differences", () => {
    const { swarm: swarmA } = seedSwarm();
    const { swarm: swarmB } = seedSwarm(MINIMAL_BLUEPRINT, "Different task");

    // Add different nectar
    const nectarA = { task: "Test task", extra: "alpha" };
    db.updateSwarm(swarmA.id, { nectar: JSON.stringify(nectarA) });
    const nectarB = { task: "Different task", extra: "beta" };
    db.updateSwarm(swarmB.id, { nectar: JSON.stringify(nectarB) });

    const result = compareSwarms(swarmA.id, swarmB.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.comparison.summary.nectar_diff_keys).toContain("task");
    expect(result.comparison.summary.nectar_diff_keys).toContain("extra");
  });

  it("returns error for non-existent swarm", () => {
    const { swarm } = seedSwarm();
    const result = compareSwarms(swarm.id, "nonexistent");
    expect(result.success).toBe(false);
  });

  it("supports swarm numbers", () => {
    const { swarm: swarmA } = seedSwarm();
    const { swarm: swarmB } = seedSwarm(MINIMAL_BLUEPRINT, "Test task 2");

    const result = compareSwarms(String(swarmA.swarm_number), String(swarmB.swarm_number));
    expect(result.success).toBe(true);
  });
});
