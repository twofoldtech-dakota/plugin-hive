import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, seedSwarm, MINIMAL_BLUEPRINT, LOOP_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { completeFlight } from "./complete.js";
import type { BlueprintSpec } from "../types.js";

/** Loop blueprint WITHOUT verify_each for testing simple loop cell completion */
const SIMPLE_LOOP_BP: BlueprintSpec = {
  id: "simple-loop",
  bees: [
    { id: "worker", role: "coding", chamber: { base_dir: "worker", files: {} } },
  ],
  flights: [
    {
      id: "implement",
      bee: "worker",
      type: "loop",
      loop: { over: "cells", completion: "all_done" },
      input: "Implement: {{current_cell}}",
      expects: "STATUS: done",
      max_retries: 3,
    },
  ],
};

beforeEach(() => {
  freshDb();
});

describe("completeFlight", () => {
  it("returns error for nonexistent flight", () => {
    const result = completeFlight("nonexistent", "output");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("returns error when flight is not in_flight", () => {
    const { flights } = seedSwarm();
    // Flight starts as "pending", not "in_flight"
    const result = completeFlight(flights[0].id, "output");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not in_flight");
    }
  });

  it("completes a single flight and parses KEY: value output", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight" });

    const result = completeFlight(flights[0].id, "STATUS: done\nFILES_CHANGED: src/auth.ts");
    expect(result.success).toBe(true);

    const flight = db.getFlight(flights[0].id)!;
    expect(flight.status).toBe("done");
    expect(flight.completed_at).toBeDefined();
    expect(flight.completed_at).not.toBeNull();

    // Check nectar was updated
    const swarmUpdated = db.getSwarm(swarm.id)!;
    const nectar = JSON.parse(swarmUpdated.nectar);
    expect(nectar.status).toBe("done");
    expect(nectar.files_changed).toBe("src/auth.ts");
  });

  it("advances pipeline after single flight completion", () => {
    const bp = {
      ...MINIMAL_BLUEPRINT,
      id: "two-bp",
      flights: [
        { id: "f1", bee: "worker", type: "single" as const, input: "Do first", expects: "done", max_retries: 2 },
        { id: "f2", bee: "worker", type: "single" as const, input: "Do second", expects: "done", max_retries: 2 },
      ],
    };
    const { swarm, flights } = seedSwarm(bp);
    db.updateFlight(flights[0].id, { status: "in_flight" });

    completeFlight(flights[0].id, "STATUS: done");

    // Second flight should be promoted to pending
    const secondFlight = db.getFlight(flights[1].id)!;
    expect(secondFlight.status).toBe("pending");
  });

  it("marks swarm completed when last flight finishes", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight" });

    completeFlight(flights[0].id, "STATUS: done");

    expect(db.getSwarm(swarm.id)!.status).toBe("completed");
  });

  it("auto-parses CELLS_JSON and inserts cells", () => {
    const { swarm, flights } = seedSwarm();
    db.updateFlight(flights[0].id, { status: "in_flight" });

    const cells = [
      { id: "cell-1", title: "First", description: "Do first", acceptance_criteria: ["Pass"] },
      { id: "cell-2", title: "Second", description: "Do second", acceptance_criteria: [] },
    ];
    const output = `CELLS_JSON: ${JSON.stringify(cells)}`;
    completeFlight(flights[0].id, output);

    const inserted = db.getCellsForSwarm(swarm.id);
    expect(inserted).toHaveLength(2);
    expect(inserted[0].cell_id).toBe("cell-1");
    expect(inserted[1].cell_id).toBe("cell-2");
  });
});

describe("completeFlight — loop flights", () => {
  it("marks cell done and re-queues flight when more cells pending (no verify)", () => {
    const { swarm, flights } = seedSwarm(SIMPLE_LOOP_BP);
    const loopFlight = flights[0]; // Only flight in SIMPLE_LOOP_BP

    // Insert two cells
    const c1 = db.insertCell(swarm.id, 0, "cell-1", "First", "Desc", ["criterion"]);
    const c2 = db.insertCell(swarm.id, 1, "cell-2", "Second", "Desc", ["criterion"]);

    // Set loop flight to in_flight with current cell
    db.updateFlight(loopFlight.id, { status: "in_flight", current_cell_id: c1.id });

    const result = completeFlight(loopFlight.id, "STATUS: done");
    expect(result.success).toBe(true);

    // Cell 1 should be done (no verify_each)
    expect(db.getCell(c1.id)!.status).toBe("done");
    // Loop flight should be re-queued (pending) for next cell
    expect(db.getFlight(loopFlight.id)!.status).toBe("pending");
  });

  it("marks loop flight done when no more cells remain (no verify)", () => {
    const { swarm, flights } = seedSwarm(SIMPLE_LOOP_BP);
    const loopFlight = flights[0];

    // Insert one cell
    const c1 = db.insertCell(swarm.id, 0, "cell-1", "First", "Desc", ["criterion"]);
    db.updateFlight(loopFlight.id, { status: "in_flight", current_cell_id: c1.id });

    completeFlight(loopFlight.id, "STATUS: done");

    expect(db.getCell(c1.id)!.status).toBe("done");
    expect(db.getFlight(loopFlight.id)!.status).toBe("done");
  });

  it("creates verification flight when verify_each is true", () => {
    const { swarm, flights } = seedSwarm(LOOP_BLUEPRINT);
    const loopFlight = flights.find(f => f.type === "loop")!;

    const c1 = db.insertCell(swarm.id, 0, "cell-1", "First", "Desc", ["criterion"]);
    db.updateFlight(loopFlight.id, { status: "in_flight", current_cell_id: c1.id });

    completeFlight(loopFlight.id, "STATUS: done");

    // Cell should be in verifying status
    expect(db.getCell(c1.id)!.status).toBe("verifying");

    // A verification flight should have been created
    const vfs = db.getVerificationFlightsForSwarm(swarm.id);
    expect(vfs.length).toBeGreaterThanOrEqual(1);

    // Parent loop flight should be waiting
    expect(db.getFlight(loopFlight.id)!.status).toBe("waiting");
  });
});

describe("completeFlight — verification flights", () => {
  it("passes verification and marks cell done", () => {
    const { swarm, flights } = seedSwarm(LOOP_BLUEPRINT);
    const loopFlight = flights.find(f => f.type === "loop")!;

    // Setup: create cell, claim loop flight, complete it (triggers verification)
    const c1 = db.insertCell(swarm.id, 0, "cell-1", "First", "Desc", ["criterion"]);
    db.insertCell(swarm.id, 1, "cell-2", "Second", "Desc", ["criterion"]);
    db.updateFlight(loopFlight.id, { status: "in_flight", current_cell_id: c1.id });
    completeFlight(loopFlight.id, "STATUS: done");

    // Now complete the verification flight with pass
    const vfs = db.getVerificationFlightsForSwarm(swarm.id);
    expect(vfs.length).toBeGreaterThanOrEqual(1);
    const vf = vfs[0];
    db.updateFlight(vf.id, { status: "in_flight" });

    const result = completeFlight(vf.id, "STATUS: pass\nFEEDBACK: Looks good");
    expect(result.success).toBe(true);

    // Cell should be done
    expect(db.getCell(c1.id)!.status).toBe("done");
    // Parent loop flight should be re-activated (more cells remain)
    expect(db.getFlight(loopFlight.id)!.status).toBe("pending");
  });

  it("retry verification resets cell to pending", () => {
    const { swarm, flights } = seedSwarm(LOOP_BLUEPRINT);
    const loopFlight = flights.find(f => f.type === "loop")!;

    const c1 = db.insertCell(swarm.id, 0, "cell-1", "First", "Desc", ["criterion"]);
    db.updateFlight(loopFlight.id, { status: "in_flight", current_cell_id: c1.id });
    completeFlight(loopFlight.id, "STATUS: done");

    const vfs = db.getVerificationFlightsForSwarm(swarm.id);
    const vf = vfs[0];
    db.updateFlight(vf.id, { status: "in_flight" });

    completeFlight(vf.id, "STATUS: retry\nFEEDBACK: Missing error handling");

    // Cell should be reset to pending for re-implementation
    expect(db.getCell(c1.id)!.status).toBe("pending");
    // Parent loop flight should be re-activated
    expect(db.getFlight(loopFlight.id)!.status).toBe("pending");
    // Feedback should be stored in nectar
    const nectar = JSON.parse(db.getSwarm(swarm.id)!.nectar);
    expect(nectar.inspect_feedback).toContain("Missing error handling");
  });
});
