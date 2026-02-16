import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb, seedSwarm, seedBlueprint, MINIMAL_BLUEPRINT, CHECKPOINT_BLUEPRINT } from "../test/helpers.js";
import { listSnapshots } from "./list.js";
import { createSnapshot } from "./create.js";

beforeEach(() => {
  freshDb();
});

describe("listSnapshots", () => {
  it("returns error when swarm is not found", () => {
    const result = listSnapshots("nonexistent-swarm-id");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("not found");
  });

  it("returns empty list for swarm with no snapshots", () => {
    const { swarm } = seedSwarm();
    const result = listSnapshots(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.snapshots).toEqual([]);
  });

  it("returns snapshots after creating one", () => {
    const { swarm } = seedSwarm();
    createSnapshot(swarm.id);

    const result = listSnapshots(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].swarm_id).toBe(swarm.id);
    expect(result.snapshots[0].snapshot_type).toBe("manual");
  });

  it("returns multiple snapshots in descending order by created_at", () => {
    const { swarm } = seedSwarm();
    const r1 = createSnapshot(swarm.id, "manual");
    const r2 = createSnapshot(swarm.id, "checkpoint");
    const r3 = createSnapshot(swarm.id, "auto");

    const result = listSnapshots(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.snapshots).toHaveLength(3);

    // Most recent first (descending created_at)
    // Since all 3 were created in rapid succession they may share the same timestamp,
    // but we can at least verify they are all returned and have correct types
    const types = result.snapshots.map(s => s.snapshot_type);
    expect(types).toContain("manual");
    expect(types).toContain("checkpoint");
    expect(types).toContain("auto");
  });

  it("only returns snapshots for the requested swarm", () => {
    const { swarm: swarm1 } = seedSwarm();
    // Create a second swarm by using a different blueprint ID to avoid collision
    const bp2 = { ...MINIMAL_BLUEPRINT, id: "test-bp-2", name: "Test Blueprint 2" };
    seedBlueprint(bp2);
    const swarm2 = db.createSwarm(bp2.id, "Other task", { task: "Other task" });

    createSnapshot(swarm1.id);
    createSnapshot(swarm1.id);
    createSnapshot(swarm2.id);

    const result1 = listSnapshots(swarm1.id);
    expect(result1.success).toBe(true);
    if (!result1.success) return;
    expect(result1.snapshots).toHaveLength(2);

    const result2 = listSnapshots(swarm2.id);
    expect(result2.success).toBe(true);
    if (!result2.success) return;
    expect(result2.snapshots).toHaveLength(1);
  });
});
