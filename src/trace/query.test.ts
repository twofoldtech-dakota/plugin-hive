import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { getFlightTraces, getSwarmTraces } from "./query.js";

beforeEach(() => {
  freshDb();
});

describe("getFlightTraces", () => {
  it("returns traces for a specific flight", () => {
    const { swarm, flights } = seedSwarm();
    const flightId = flights[0].id;

    db.insertFlightTrace(flightId, swarm.id, "claimed", { bee_id: "test-bp_worker" });
    db.insertFlightTrace(flightId, swarm.id, "error", { message: "something broke" });

    const result = getFlightTraces(flightId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.traces).toHaveLength(2);
      expect(result.traces[0].trace_type).toBe("claimed");
      expect(result.traces[1].trace_type).toBe("error");
      expect(result.traces[0].flight_id).toBe(flightId);
      expect(result.traces[1].flight_id).toBe(flightId);
    }
  });

  it("returns success false for a non-existent flight", () => {
    const result = getFlightTraces("non-existent-flight-id");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("non-existent-flight-id");
      expect(result.error).toContain("not found");
    }
  });

  it("returns empty traces array when flight exists but has no traces", () => {
    const { flights } = seedSwarm();
    const flightId = flights[0].id;

    const result = getFlightTraces(flightId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.traces).toHaveLength(0);
    }
  });
});

describe("getSwarmTraces", () => {
  it("returns all traces across all flights for a swarm", () => {
    const { swarm, flights } = seedSwarm();
    const flightId = flights[0].id;

    db.insertFlightTrace(flightId, swarm.id, "claimed", { bee_id: "test-bp_worker" });
    db.insertFlightTrace(flightId, swarm.id, "retry", { attempt: 1 });
    db.insertFlightTrace(flightId, swarm.id, "output", { result: "done" });

    const result = getSwarmTraces(swarm.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.traces).toHaveLength(3);
      expect(result.traces.every(t => t.swarm_id === swarm.id)).toBe(true);
      expect(result.traces.map(t => t.trace_type)).toEqual(["claimed", "retry", "output"]);
    }
  });

  it("returns success false for a non-existent swarm", () => {
    const result = getSwarmTraces("non-existent-swarm-id");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("non-existent-swarm-id");
      expect(result.error).toContain("not found");
    }
  });

  it("returns empty traces array when swarm exists but has no traces", () => {
    const { swarm } = seedSwarm();

    const result = getSwarmTraces(swarm.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.traces).toHaveLength(0);
    }
  });
});
