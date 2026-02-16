import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedSwarm, seedBlueprint, MINIMAL_BLUEPRINT, CHECKPOINT_BLUEPRINT } from "../test/helpers.js";
import { createCheckpoint, maybeAutoCheckpoint } from "./checkpoint.js";

beforeEach(() => {
  freshDb();
});

describe("createCheckpoint", () => {
  it("returns success with snapshot of type checkpoint", () => {
    const { swarm } = seedSwarm();
    const result = createCheckpoint(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot.snapshot_type).toBe("checkpoint");
    expect(result.snapshot.swarm_id).toBe(swarm.id);
  });

  it("returns error when swarm is not found", () => {
    const result = createCheckpoint("nonexistent-swarm-id");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("not found");
  });

  it("persists the checkpoint snapshot in the database", () => {
    const { swarm } = seedSwarm();
    const result = createCheckpoint(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const persisted = db.getSnapshot(result.snapshot.id);
    expect(persisted).toBeDefined();
    expect(persisted!.snapshot_type).toBe("checkpoint");
  });

  it("snapshot data contains full swarm state", () => {
    const { swarm, flights } = seedSwarm();
    const result = createCheckpoint(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const data = JSON.parse(result.snapshot.data);
    expect(data.swarm).toBeDefined();
    expect(data.flights).toBeDefined();
    expect(data.cells).toBeDefined();
    expect(data.flights).toHaveLength(flights.length);
  });
});

describe("maybeAutoCheckpoint", () => {
  it("returns false when swarm is not found", () => {
    expect(maybeAutoCheckpoint("nonexistent-swarm-id")).toBe(false);
  });

  it("returns false when blueprint has no checkpoint_interval", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT);

    // Complete the flight so there's a done flight
    db.updateFlight(flights[0].id, { status: "done" });

    expect(maybeAutoCheckpoint(swarm.id)).toBe(false);

    // Verify no snapshots were created
    const snapshots = db.getSnapshotsForSwarm(swarm.id);
    expect(snapshots).toHaveLength(0);
  });

  it("creates checkpoint when completed flights match checkpoint_interval", () => {
    // CHECKPOINT_BLUEPRINT has beekeeper.checkpoint_interval = 1
    const { swarm, flights } = seedSwarm(CHECKPOINT_BLUEPRINT);

    // Complete the flight (1 done flight, interval = 1, so 1 % 1 === 0 -> checkpoint)
    db.updateFlight(flights[0].id, { status: "done" });

    const result = maybeAutoCheckpoint(swarm.id);
    expect(result).toBe(true);

    // Verify the auto snapshot was created
    const snapshots = db.getSnapshotsForSwarm(swarm.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].snapshot_type).toBe("auto");
  });

  it("does not create checkpoint when no flights are completed", () => {
    const { swarm } = seedSwarm(CHECKPOINT_BLUEPRINT);

    // No flights completed yet
    const result = maybeAutoCheckpoint(swarm.id);
    expect(result).toBe(false);

    const snapshots = db.getSnapshotsForSwarm(swarm.id);
    expect(snapshots).toHaveLength(0);
  });

  it("skips verify_meta flights when counting completions", () => {
    const { swarm, flights } = seedSwarm(CHECKPOINT_BLUEPRINT);

    // Mark the flight as done but with verify_meta (simulating a verification flight)
    db.updateFlight(flights[0].id, { status: "done", verify_meta: JSON.stringify({ parent: "some-flight" }) });

    // verify_meta flights are excluded from the count, so no checkpoint
    const result = maybeAutoCheckpoint(swarm.id);
    expect(result).toBe(false);

    const snapshots = db.getSnapshotsForSwarm(swarm.id);
    expect(snapshots).toHaveLength(0);
  });

  it("returns false when blueprint has no beekeeper config", () => {
    // Use MINIMAL_BLUEPRINT which has no beekeeper config
    const { swarm } = seedSwarm(MINIMAL_BLUEPRINT);
    expect(maybeAutoCheckpoint(swarm.id)).toBe(false);
  });
});
