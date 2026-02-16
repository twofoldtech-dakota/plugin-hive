import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedSwarm, seedBlueprint, MINIMAL_BLUEPRINT, CHECKPOINT_BLUEPRINT } from "../test/helpers.js";
import { createSnapshot } from "./create.js";
import { restoreSnapshot } from "./restore.js";

beforeEach(() => {
  freshDb();
});

describe("restoreSnapshot", () => {
  it("returns error when snapshot is not found", () => {
    const result = restoreSnapshot("nonexistent-snapshot-id");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("not found");
  });

  it("returns success when restoring a valid snapshot", () => {
    const { swarm } = seedSwarm();
    const snapResult = createSnapshot(swarm.id);
    expect(snapResult.success).toBe(true);
    if (!snapResult.success) return;

    const result = restoreSnapshot(snapResult.snapshot.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.message).toContain(snapResult.snapshot.id);
    expect(result.flights_reset).toBeGreaterThanOrEqual(0);
    expect(result.cells_reset).toBeGreaterThanOrEqual(0);
  });

  it("restores flight statuses to their snapshotted state", () => {
    const { swarm, flights } = seedSwarm();

    // Take a snapshot while the first flight is pending
    const snapResult = createSnapshot(swarm.id);
    expect(snapResult.success).toBe(true);
    if (!snapResult.success) return;

    // Advance the flight status to simulate progress
    db.updateFlight(flights[0].id, { status: "done", output: "completed work" });

    // Verify the flight was updated
    const updatedFlight = db.getFlight(flights[0].id)!;
    expect(updatedFlight.status).toBe("done");

    // Restore the snapshot
    const result = restoreSnapshot(snapResult.snapshot.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.flights_reset).toBe(1);

    // Verify the flight was restored to its original state
    const restoredFlight = db.getFlight(flights[0].id)!;
    expect(restoredFlight.status).toBe("pending");
  });

  it("restores swarm status to its snapshotted state", () => {
    const { swarm } = seedSwarm();

    // Take a snapshot while the swarm is buzzing
    const snapResult = createSnapshot(swarm.id);
    expect(snapResult.success).toBe(true);
    if (!snapResult.success) return;

    // Change the swarm status
    db.updateSwarm(swarm.id, { status: "done" });
    const updatedSwarm = db.getSwarm(swarm.id)!;
    expect(updatedSwarm.status).toBe("done");

    // Restore the snapshot
    const result = restoreSnapshot(snapResult.snapshot.id);
    expect(result.success).toBe(true);

    // Verify swarm status was restored
    const restoredSwarm = db.getSwarm(swarm.id)!;
    expect(restoredSwarm.status).toBe("buzzing");
  });

  it("restores cells to their snapshotted state", () => {
    const { swarm } = seedSwarm();

    // Add cells and take snapshot
    const cell = db.insertCell(swarm.id, 0, "cell-1", "Task 1", "Do something", ["done"]);
    const snapResult = createSnapshot(swarm.id);
    expect(snapResult.success).toBe(true);
    if (!snapResult.success) return;

    // Modify cell status
    db.updateCell(cell.id, { status: "done", output: "finished" });
    const updatedCell = db.getCell(cell.id)!;
    expect(updatedCell.status).toBe("done");

    // Restore the snapshot
    const result = restoreSnapshot(snapResult.snapshot.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.cells_reset).toBe(1);

    // Verify cell was restored
    const restoredCell = db.getCell(cell.id)!;
    expect(restoredCell.status).toBe("pending");
  });

  it("reports zero cells_reset when no cells exist", () => {
    const { swarm } = seedSwarm();
    const snapResult = createSnapshot(swarm.id);
    expect(snapResult.success).toBe(true);
    if (!snapResult.success) return;

    const result = restoreSnapshot(snapResult.snapshot.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.cells_reset).toBe(0);
  });

  it("restores nectar to its snapshotted state", () => {
    const { swarm } = seedSwarm();

    // Take snapshot with initial nectar
    const snapResult = createSnapshot(swarm.id);
    expect(snapResult.success).toBe(true);
    if (!snapResult.success) return;

    // Modify nectar
    db.updateSwarm(swarm.id, { nectar: JSON.stringify({ task: "Test task", extra: "added" }) });

    // Restore
    restoreSnapshot(snapResult.snapshot.id);

    const restoredSwarm = db.getSwarm(swarm.id)!;
    const nectar = JSON.parse(restoredSwarm.nectar);
    expect(nectar.task).toBe("Test task");
    expect(nectar.extra).toBeUndefined();
  });
});
