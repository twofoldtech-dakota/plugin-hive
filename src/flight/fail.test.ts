import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, seedSwarm, MINIMAL_BLUEPRINT, LOOP_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { failFlight } from "./fail.js";

beforeEach(() => {
  freshDb();
});

describe("failFlight", () => {
  it("returns error for nonexistent flight", () => {
    const result = failFlight("nonexistent", "error");
    expect(result.success).toBe(false);
  });

  it("retries a flight when retry_count < max_retries", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight" });

    const result = failFlight(flights[0].id, "Something broke");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.retrying).toBe(true);
    }

    const updated = db.getFlight(flights[0].id)!;
    expect(updated.status).toBe("pending");
    expect(updated.retry_count).toBe(1);
  });

  it("fails permanently when retries exhausted", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight", retry_count: 2 }); // max_retries is 2

    const result = failFlight(flights[0].id, "Fatal error");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.retrying).toBe(false);
    }

    expect(db.getFlight(flights[0].id)!.status).toBe("failed");
    expect(db.getSwarm(swarm.id)!.status).toBe("failed");
  });

  it("retries a cell in a loop flight", () => {
    const { swarm, flights } = seedSwarm(LOOP_BLUEPRINT);
    const loopFlight = flights.find(f => f.type === "loop")!;
    // Insert a cell and assign it to the loop flight
    const cell = db.insertCell(swarm.id, 0, "cell-1", "Title", "Desc", ["criterion"]);
    db.updateFlight(loopFlight.id, { status: "in_flight", current_cell_id: cell.id });

    const result = failFlight(loopFlight.id, "Cell error");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.retrying).toBe(true);
    }

    expect(db.getCell(cell.id)!.status).toBe("pending");
    expect(db.getCell(cell.id)!.retry_count).toBe(1);
    expect(db.getFlight(loopFlight.id)!.status).toBe("pending");
  });

  it("falls through to flight retry when cell retries exhausted", () => {
    const { swarm, flights } = seedSwarm(LOOP_BLUEPRINT);
    const loopFlight = flights.find(f => f.type === "loop")!;
    const cell = db.insertCell(swarm.id, 0, "cell-1", "Title", "Desc", ["criterion"], 0); // max_retries = 0
    db.updateCell(cell.id, { retry_count: 0 }); // Already at max
    db.updateFlight(loopFlight.id, { status: "in_flight", current_cell_id: cell.id });

    // Cell retries exhausted, but flight still has retries
    const result = failFlight(loopFlight.id, "Cell failed");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.retrying).toBe(true);
    }
    // Flight should be retried
    expect(db.getFlight(loopFlight.id)!.status).toBe("pending");
    expect(db.getFlight(loopFlight.id)!.retry_count).toBe(1);
  });
});
