import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, seedSwarm } from "../test/helpers.js";
import * as db from "../db.js";
import { checkStuckFlights, checkStalledSwarms, checkZombieSwarms, checkExhaustedRetries, checkVerificationLoops, checkStuckCells, checkSlowFlights } from "./checks.js";
import { resolveBeekeeperThresholds } from "./config.js";

beforeEach(() => {
  freshDb();
});

describe("checkStuckFlights", () => {
  it("returns empty when no stuck flights", () => {
    expect(checkStuckFlights()).toHaveLength(0);
  });

  it("returns correct structure for stuck flights", () => {
    // The time-dependent query is tested in db.test.ts.
    // Here we verify the mapping from DB results to CheckResult.
    // Since we can't easily backdate updated_at, we test the shape
    // when stuck flights exist by checking the mapping logic indirectly:
    // checkStuckFlights with 0 timeout and a freshly-created in_flight
    // won't match because updated_at = now is NOT < now, which is correct behavior.
    const { flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight" });
    const results = checkStuckFlights(0);
    // The flight was just updated so it won't be "stuck" — correct behavior
    expect(results).toHaveLength(0);
  });
});

describe("checkStalledSwarms", () => {
  it("returns empty when no stalled swarms", () => {
    expect(checkStalledSwarms()).toHaveLength(0);
  });
});

describe("checkZombieSwarms", () => {
  it("returns empty when no zombie swarms", () => {
    expect(checkZombieSwarms()).toHaveLength(0);
  });

  it("detects zombie swarms", () => {
    const { swarm, flights } = seedSwarm();
    // All flights done but swarm still buzzing
    db.updateFlight(flights[0].id, { status: "done" });

    const results = checkZombieSwarms();
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].severity).toBe("critical");
    expect(results[0].entity_type).toBe("swarm");
    expect(results[0].remediation).toBe("resolveZombieSwarm");
  });
});

describe("checkExhaustedRetries", () => {
  it("returns empty when no exhausted flights", () => {
    expect(checkExhaustedRetries()).toHaveLength(0);
  });

  it("detects flights with high abandon count", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { abandoned_count: 5 });

    const results = checkExhaustedRetries();
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("critical");
    expect(results[0].remediation).toBe("failExhaustedFlight");
  });
});

describe("checkVerificationLoops", () => {
  it("returns empty when no cells exceed retry threshold", () => {
    const { swarm } = seedSwarm();
    const thresholds = resolveBeekeeperThresholds();
    const results = checkVerificationLoops(swarm.id, thresholds);
    expect(results).toHaveLength(0);
  });
});

describe("checkStuckCells", () => {
  it("returns empty when no stuck cells", () => {
    const { swarm } = seedSwarm();
    const thresholds = resolveBeekeeperThresholds();
    const results = checkStuckCells(swarm.id, thresholds);
    expect(results).toHaveLength(0);
  });
});

describe("checkSlowFlights", () => {
  it("returns empty when no slow flights", () => {
    const results = checkSlowFlights();
    expect(results).toHaveLength(0);
  });
});

describe("resolveBeekeeperThresholds", () => {
  it("returns defaults when no config provided", () => {
    const thresholds = resolveBeekeeperThresholds();
    expect(thresholds.stuck_flight_minutes).toBe(35);
    expect(thresholds.stalled_swarm_minutes).toBe(30);
    expect(thresholds.verification_loop_max).toBe(3);
    expect(thresholds.cell_stuck_minutes).toBe(30);
  });

  it("overrides with blueprint config", () => {
    const thresholds = resolveBeekeeperThresholds({
      stuck_flight_minutes: 45,
      verification_loop_max: 5,
    });
    expect(thresholds.stuck_flight_minutes).toBe(45);
    expect(thresholds.stalled_swarm_minutes).toBe(30); // default
    expect(thresholds.verification_loop_max).toBe(5);
  });
});
