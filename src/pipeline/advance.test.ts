import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { advancePipeline } from "./advance.js";
import type { BlueprintSpec } from "../types.js";

const TWO_FLIGHT_BP: BlueprintSpec = {
  id: "two-flight",
  bees: [
    { id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } },
  ],
  flights: [
    { id: "first", bee: "worker", type: "single", input: "Do first", expects: "STATUS: done", max_retries: 2 },
    { id: "second", bee: "worker", type: "single", input: "Do second", expects: "STATUS: done", max_retries: 2 },
  ],
};

beforeEach(() => {
  freshDb();
});

describe("advancePipeline", () => {
  it("marks swarm completed when all flights are done", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT);
    db.updateFlight(flights[0].id, { status: "done" });

    const result = advancePipeline(swarm.id);
    expect(result.action).toBe("completed");
    expect(db.getSwarm(swarm.id)!.status).toBe("completed");
  });

  it("promotes next waiting flight when previous is done", () => {
    const { swarm, flights } = seedSwarm(TWO_FLIGHT_BP);
    // First flight is pending (index 0), second is waiting (index 1)
    db.updateFlight(flights[0].id, { status: "done" });

    const result = advancePipeline(swarm.id);
    expect(result.action).toBe("advanced");
    const second = db.getFlight(flights[1].id)!;
    expect(second.status).toBe("pending");
  });

  it("returns none when a flight has failed", () => {
    const { swarm, flights } = seedSwarm(TWO_FLIGHT_BP);
    db.updateFlight(flights[0].id, { status: "failed" });

    const result = advancePipeline(swarm.id);
    expect(result.action).toBe("none");
  });

  it("returns none when waiting flight's predecessor is not done", () => {
    const { swarm } = seedSwarm(TWO_FLIGHT_BP);
    // Both flights are in initial state (first=pending, second=waiting)
    // Don't change anything — first is not done yet

    const result = advancePipeline(swarm.id);
    expect(result.action).toBe("none");
  });

  it("excludes verification flights from all-done check", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT);
    db.updateFlight(flights[0].id, { status: "done" });
    // Add a verification flight that is still pending
    db.insertVerificationFlight(swarm.id, "vf-1", "test-bp_inspector", 1, "verify", "STATUS: pass", 1, '{"parent":"x"}');

    const result = advancePipeline(swarm.id);
    // Should be "completed" because verification flights don't block
    expect(result.action).toBe("completed");
  });

  it("promotes first flight (index 0) when it is waiting", () => {
    const { swarm } = seedSwarm(TWO_FLIGHT_BP);
    // Manually set first flight to waiting (edge case)
    const flights = db.getFlightsForSwarm(swarm.id);
    db.updateFlight(flights[0].id, { status: "waiting" });

    const result = advancePipeline(swarm.id);
    expect(result.action).toBe("advanced");
    expect(db.getFlight(flights[0].id)!.status).toBe("pending");
  });
});
