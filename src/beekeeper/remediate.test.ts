import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { resetStuckFlight, resolveZombieSwarm, failExhaustedFlight, advanceStalledSwarm } from "./remediate.js";
import type { BlueprintSpec } from "../types.js";

beforeEach(() => {
  freshDb();
});

describe("resetStuckFlight", () => {
  it("returns failure for nonexistent flight", () => {
    const result = resetStuckFlight("nonexistent");
    expect(result.success).toBe(false);
  });

  it("resets a stuck flight to pending", () => {
    const { flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight" });

    const result = resetStuckFlight(flights[0].id);
    expect(result.success).toBe(true);
    expect(result.detail).toContain("Reset to pending");

    const updated = db.getFlight(flights[0].id)!;
    expect(updated.status).toBe("pending");
    expect(updated.abandoned_count).toBe(1);
  });

  it("increments abandoned_count on each reset", () => {
    const { flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight", abandoned_count: 3 });

    resetStuckFlight(flights[0].id);
    expect(db.getFlight(flights[0].id)!.abandoned_count).toBe(4);
  });

  it("fails flight when abandoned 5+ times", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight", abandoned_count: 4 });

    const result = resetStuckFlight(flights[0].id);
    expect(result.success).toBe(true);
    expect(result.detail).toContain("Failed flight");

    expect(db.getFlight(flights[0].id)!.status).toBe("failed");
    expect(db.getSwarm(swarm.id)!.status).toBe("failed");
  });
});

describe("resolveZombieSwarm", () => {
  it("marks zombie swarm completed when all flights done", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "done" });

    const result = resolveZombieSwarm(swarm.id);
    expect(result.success).toBe(true);
    expect(result.detail).toContain("completed");
    expect(db.getSwarm(swarm.id)!.status).toBe("completed");
  });

  it("marks zombie swarm failed when any flight failed", () => {
    const bp: BlueprintSpec = {
      id: "two-bp",
      bees: [{ id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } }],
      flights: [
        { id: "f1", bee: "worker", type: "single", input: "First", expects: "done", max_retries: 2 },
        { id: "f2", bee: "worker", type: "single", input: "Second", expects: "done", max_retries: 2 },
      ],
    };
    const { swarm, flights } = seedSwarm(bp);
    db.updateFlight(flights[0].id, { status: "done" });
    db.updateFlight(flights[1].id, { status: "failed" });

    const result = resolveZombieSwarm(swarm.id);
    expect(result.success).toBe(true);
    expect(result.detail).toContain("failed");
    expect(db.getSwarm(swarm.id)!.status).toBe("failed");
  });
});

describe("failExhaustedFlight", () => {
  it("returns failure for nonexistent flight", () => {
    const result = failExhaustedFlight("nonexistent");
    expect(result.success).toBe(false);
  });

  it("fails flight and its swarm", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { abandoned_count: 5 });

    const result = failExhaustedFlight(flights[0].id);
    expect(result.success).toBe(true);

    expect(db.getFlight(flights[0].id)!.status).toBe("failed");
    expect(db.getSwarm(swarm.id)!.status).toBe("failed");
  });
});

describe("advanceStalledSwarm", () => {
  it("advances pipeline for stalled swarm", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "done" });

    const result = advanceStalledSwarm(swarm.id);
    expect(result.success).toBe(true);
    expect(result.detail).toContain("completed");
  });
});
