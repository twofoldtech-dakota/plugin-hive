import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { archiveSwarm } from "./archive.js";
import { getStorageStatus } from "./storage.js";

describe("Swarm Archive", () => {
  beforeEach(() => {
    freshDb();
  });

  it("archives a completed swarm", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT, "Archive test");
    // Complete the flight and swarm
    db.updateFlight(flights[0].id, { status: "done", output: "STATUS: done" });
    db.updateSwarm(swarm.id, { status: "completed" });

    const result = archiveSwarm(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.archive_id).toBeTruthy();
    expect(result.message).toContain("archived");

    // Original data should be deleted
    expect(db.getSwarm(swarm.id)).toBeUndefined();
    expect(db.getFlightsForSwarm(swarm.id)).toEqual([]);

    // Archive should exist
    const archive = db.getSwarmArchive(result.archive_id);
    expect(archive).toBeDefined();
    expect(archive!.swarm_number).toBe(swarm.swarm_number);
    expect(archive!.blueprint_id).toBe(MINIMAL_BLUEPRINT.id);
    expect(archive!.original_status).toBe("completed");
  });

  it("archives a failed swarm", () => {
    const { swarm } = seedSwarm(MINIMAL_BLUEPRINT, "Failed task");
    db.updateSwarm(swarm.id, { status: "failed" });

    const result = archiveSwarm(swarm.id);
    expect(result.success).toBe(true);
  });

  it("rejects archiving a buzzing swarm", () => {
    const { swarm } = seedSwarm(MINIMAL_BLUEPRINT, "Still running");

    const result = archiveSwarm(swarm.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("buzzing");
    }
  });

  it("rejects archiving nonexistent swarm", () => {
    const result = archiveSwarm("nonexistent");
    expect(result.success).toBe(false);
  });

  it("archive data contains full state", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT, "Full state test");
    db.updateFlight(flights[0].id, { status: "done", output: "STATUS: done" });
    db.updateSwarm(swarm.id, { status: "completed" });

    const result = archiveSwarm(swarm.id);
    if (!result.success) return;

    const archive = db.getSwarmArchive(result.archive_id);
    const data = JSON.parse(archive!.data);
    expect(data.swarm).toBeDefined();
    expect(data.flights).toBeDefined();
    expect(Array.isArray(data.flights)).toBe(true);
  });
});

describe("Storage Status", () => {
  beforeEach(() => {
    freshDb();
  });

  it("returns storage status", () => {
    seedSwarm(MINIMAL_BLUEPRINT, "Status test");
    const status = getStorageStatus();

    expect(status.db_file_size_bytes).toBeGreaterThan(0);
    expect(status.table_counts.swarms).toBe(1);
    expect(status.table_counts.flights).toBe(1);
    expect(status.retention.retention_days).toBe(30);
    expect(status.retention.auto_archive).toBe(false);
  });
});
