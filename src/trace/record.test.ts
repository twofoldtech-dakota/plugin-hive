import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { insertTrace } from "./record.js";

beforeEach(() => {
  freshDb();
});

describe("insertTrace", () => {
  it("inserts a claimed trace and persists it in the DB", () => {
    const { swarm, flights } = seedSwarm();
    const flightId = flights[0].id;
    const data = { bee_id: "test-bp_worker", timestamp: "2026-02-15T00:00:00Z" };

    const trace = insertTrace(flightId, swarm.id, "claimed", data);

    expect(trace.id).toBeDefined();
    expect(trace.flight_id).toBe(flightId);
    expect(trace.swarm_id).toBe(swarm.id);
    expect(trace.trace_type).toBe("claimed");
    expect(JSON.parse(trace.data)).toEqual(data);
    expect(trace.created_at).toBeDefined();

    const stored = db.getTracesForFlight(flightId);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(trace.id);
    expect(stored[0].trace_type).toBe("claimed");
  });

  it("inserts an error trace and persists it in the DB", () => {
    const { swarm, flights } = seedSwarm();
    const flightId = flights[0].id;
    const data = { message: "Unexpected failure", code: "ERR_TIMEOUT" };

    const trace = insertTrace(flightId, swarm.id, "error", data);

    expect(trace.trace_type).toBe("error");
    expect(JSON.parse(trace.data)).toEqual(data);

    const stored = db.getTracesForFlight(flightId);
    expect(stored).toHaveLength(1);
    expect(stored[0].trace_type).toBe("error");
    expect(JSON.parse(stored[0].data)).toMatchObject({ message: "Unexpected failure" });
  });

  it("inserts a retry trace and persists it in the DB", () => {
    const { swarm, flights } = seedSwarm();
    const flightId = flights[0].id;
    const data = { attempt: 2, reason: "transient error", strategy: "exponential" };

    const trace = insertTrace(flightId, swarm.id, "retry", data);

    expect(trace.trace_type).toBe("retry");
    expect(JSON.parse(trace.data)).toEqual(data);

    const stored = db.getTracesForFlight(flightId);
    expect(stored).toHaveLength(1);
    expect(stored[0].trace_type).toBe("retry");
    expect(JSON.parse(stored[0].data)).toMatchObject({ attempt: 2 });
  });

  it("accumulates multiple traces for the same flight", () => {
    const { swarm, flights } = seedSwarm();
    const flightId = flights[0].id;

    insertTrace(flightId, swarm.id, "claimed", { bee_id: "test-bp_worker" });
    insertTrace(flightId, swarm.id, "retry", { attempt: 1 });
    insertTrace(flightId, swarm.id, "error", { message: "failed" });

    const stored = db.getTracesForFlight(flightId);
    expect(stored).toHaveLength(3);
    expect(stored.map(t => t.trace_type)).toEqual(["claimed", "retry", "error"]);
  });
});
