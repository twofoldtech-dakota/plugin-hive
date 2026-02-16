import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedSwarm, seedBlueprint, MINIMAL_BLUEPRINT, CHECKPOINT_BLUEPRINT } from "../test/helpers.js";
import { createSnapshot } from "./create.js";

beforeEach(() => {
  freshDb();
});

describe("createSnapshot", () => {
  it("returns success with snapshot record for a valid swarm", () => {
    const { swarm } = seedSwarm();
    const result = createSnapshot(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot.id).toBeDefined();
    expect(result.snapshot.swarm_id).toBe(swarm.id);
    expect(result.snapshot.snapshot_type).toBe("manual");
    expect(result.snapshot.created_at).toBeDefined();
  });

  it("returns error when swarm is not found", () => {
    const result = createSnapshot("nonexistent-swarm-id");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("not found");
  });

  it("defaults to manual snapshot type", () => {
    const { swarm } = seedSwarm();
    const result = createSnapshot(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.snapshot.snapshot_type).toBe("manual");
  });

  it("accepts a custom snapshot type", () => {
    const { swarm } = seedSwarm();
    const result = createSnapshot(swarm.id, "checkpoint");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.snapshot.snapshot_type).toBe("checkpoint");
  });

  it("snapshot data contains swarm, flights, cells, and nectar", () => {
    const { swarm, flights } = seedSwarm();
    // Add a cell so the snapshot captures it
    db.insertCell(swarm.id, 0, "cell-1", "Task 1", "Do something", ["done"]);

    const result = createSnapshot(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const data = JSON.parse(result.snapshot.data);
    expect(data.swarm).toBeDefined();
    expect(data.swarm.id).toBe(swarm.id);
    expect(data.swarm.task).toBe("Test task");
    expect(data.swarm.status).toBe("buzzing");
    expect(data.swarm.nectar).toBeDefined();

    expect(data.flights).toBeDefined();
    expect(Array.isArray(data.flights)).toBe(true);
    expect(data.flights).toHaveLength(flights.length);
    expect(data.flights[0].flight_id).toBe(flights[0].flight_id);

    expect(data.cells).toBeDefined();
    expect(Array.isArray(data.cells)).toBe(true);
    expect(data.cells).toHaveLength(1);
    expect(data.cells[0].title).toBe("Task 1");

    expect(data.snapshot_at).toBeDefined();
  });

  it("snapshot data contains empty cells array when no cells exist", () => {
    const { swarm } = seedSwarm();
    const result = createSnapshot(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const data = JSON.parse(result.snapshot.data);
    expect(data.cells).toEqual([]);
  });

  it("snapshot is persisted in the database", () => {
    const { swarm } = seedSwarm();
    const result = createSnapshot(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const persisted = db.getSnapshot(result.snapshot.id);
    expect(persisted).toBeDefined();
    expect(persisted!.swarm_id).toBe(swarm.id);
    expect(persisted!.snapshot_type).toBe("manual");
  });

  it("can create multiple snapshots for the same swarm", () => {
    const { swarm } = seedSwarm();
    const r1 = createSnapshot(swarm.id);
    const r2 = createSnapshot(swarm.id, "checkpoint");
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    if (!r1.success || !r2.success) return;
    expect(r1.snapshot.id).not.toBe(r2.snapshot.id);

    const snapshots = db.getSnapshotsForSwarm(swarm.id);
    expect(snapshots).toHaveLength(2);
  });
});
