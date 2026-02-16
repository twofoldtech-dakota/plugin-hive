import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { reportPulse, getFlightProgress } from "./pulse.js";

beforeEach(() => {
  process.env.HIVE_DATA_DIR = "/tmp/hive-test-pulse";
  freshDb();
});

describe("reportPulse", () => {
  it("reports pulse for an in_flight flight", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];
    db.updateFlight(flight.id, { status: "in_flight" });

    const result = reportPulse(flight.id, "parsing", 0.5, "Halfway done");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pulse.step).toBe("parsing");
      expect(result.pulse.progress).toBe(0.5);
      expect(result.pulse.message).toBe("Halfway done");
      expect(result.pulse.flight_id).toBe(flight.id);
      expect(result.pulse.swarm_id).toBe(swarm.id);
    }
  });

  it("returns error for non-existent flight", () => {
    const result = reportPulse("not-found", "step", 0.5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("returns error for flight not in_flight", () => {
    const { flights } = seedSwarm();
    const flight = flights[0]; // pending status

    const result = reportPulse(flight.id, "step", 0.5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not in_flight");
    }
  });

  it("clamps progress to [0, 1]", () => {
    const { flights } = seedSwarm();
    const flight = flights[0];
    db.updateFlight(flight.id, { status: "in_flight" });

    const r1 = reportPulse(flight.id, "over", 1.5);
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.pulse.progress).toBe(1);

    const r2 = reportPulse(flight.id, "under", -0.5);
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.pulse.progress).toBe(0);
  });

  it("ring-buffers to 20 pulses per flight", () => {
    const { flights } = seedSwarm();
    const flight = flights[0];
    db.updateFlight(flight.id, { status: "in_flight" });

    for (let i = 0; i < 25; i++) {
      reportPulse(flight.id, `step-${i}`, i / 25);
    }

    const pulses = db.getPulsesForFlight(flight.id);
    expect(pulses.length).toBe(20);
  });
});

describe("getFlightProgress", () => {
  it("returns pulses for a specific flight", () => {
    const { flights } = seedSwarm();
    const flight = flights[0];
    db.updateFlight(flight.id, { status: "in_flight" });
    reportPulse(flight.id, "step-1", 0.3);
    reportPulse(flight.id, "step-2", 0.7);

    const result = getFlightProgress({ flight_id: flight.id });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.flights).toHaveLength(1);
      expect(result.flights[0].pulses).toHaveLength(2);
    }
  });

  it("returns active flights with pulses for a swarm", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];
    db.updateFlight(flight.id, { status: "in_flight" });
    reportPulse(flight.id, "working", 0.5);

    const result = getFlightProgress({ swarm_id: swarm.id });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.flights).toHaveLength(1);
      expect(result.flights[0].flight_id).toBe(flight.id);
    }
  });

  it("returns error without flight_id or swarm_id", () => {
    const result = getFlightProgress({});
    expect(result.success).toBe(false);
  });

  it("returns error for non-existent flight", () => {
    const result = getFlightProgress({ flight_id: "not-found" });
    expect(result.success).toBe(false);
  });
});
