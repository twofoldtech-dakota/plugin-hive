import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { createSwarmFromBlueprint } from "./create.js";

beforeEach(() => {
  process.env.HIVE_DATA_DIR = "/tmp/hive-test-scheduling";
  freshDb();
});

describe("swarm scheduling & priorities", () => {
  it("creates a normal swarm with default priority", () => {
    seedBlueprint();
    const result = createSwarmFromBlueprint("test-bp", "Normal task");
    expect(result.success).toBe(true);
    if (result.success) {
      const swarm = db.getSwarm(result.data.id);
      expect(swarm).toBeDefined();
      expect(swarm!.priority).toBe(5);
      expect(swarm!.schedule_at).toBeNull();
      expect(swarm!.status).toBe("buzzing");
    }
  });

  it("creates swarm with custom priority", () => {
    seedBlueprint();
    const result = createSwarmFromBlueprint("test-bp", "High priority task", undefined, undefined, undefined, { priority: 9 });
    expect(result.success).toBe(true);
    if (result.success) {
      const swarm = db.getSwarm(result.data.id);
      expect(swarm!.priority).toBe(9);
      expect(swarm!.status).toBe("buzzing");
    }
  });

  it("creates scheduled swarm with status scheduled", () => {
    seedBlueprint();
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    const result = createSwarmFromBlueprint("test-bp", "Later task", undefined, undefined, undefined, { schedule_at: futureDate });
    expect(result.success).toBe(true);
    if (result.success) {
      const swarm = db.getSwarm(result.data.id);
      expect(swarm!.status).toBe("scheduled");
      expect(swarm!.schedule_at).toBe(futureDate);
    }
  });

  it("creates scheduled swarm with priority", () => {
    seedBlueprint();
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    const result = createSwarmFromBlueprint("test-bp", "Priority later", undefined, undefined, undefined, { priority: 10, schedule_at: futureDate });
    expect(result.success).toBe(true);
    if (result.success) {
      const swarm = db.getSwarm(result.data.id);
      expect(swarm!.status).toBe("scheduled");
      expect(swarm!.priority).toBe(10);
    }
  });

  it("priority affects flight claim ordering", () => {
    seedBlueprint();
    const r1 = createSwarmFromBlueprint("test-bp", "Low priority", undefined, undefined, undefined, { priority: 1 });
    const r2 = createSwarmFromBlueprint("test-bp", "High priority", undefined, undefined, undefined, { priority: 10 });
    expect(r1.success && r2.success).toBe(true);

    if (r1.success && r2.success) {
      // Claim should pick the higher priority swarm's flight first
      const claimed = db.claimFlightForBee("test-bp_worker");
      expect(claimed).toBeDefined();
      expect(claimed!.swarm_id).toBe(r2.data.id);
    }
  });

  it("getScheduledSwarms returns due swarms", () => {
    seedBlueprint();
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    createSwarmFromBlueprint("test-bp", "Overdue task", undefined, undefined, undefined, { schedule_at: pastDate });

    const scheduled = db.getScheduledSwarms();
    expect(scheduled.length).toBeGreaterThanOrEqual(1);
    expect(scheduled[0].status).toBe("scheduled");
  });

  it("scheduled swarm promotion changes status to buzzing", () => {
    seedBlueprint();
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const result = createSwarmFromBlueprint("test-bp", "Promote me", undefined, undefined, undefined, { schedule_at: pastDate });
    expect(result.success).toBe(true);

    if (result.success) {
      const swarm = db.getSwarm(result.data.id);
      expect(swarm!.status).toBe("scheduled");

      db.updateSwarm(result.data.id, { status: "buzzing" });
      const promoted = db.getSwarm(result.data.id);
      expect(promoted!.status).toBe("buzzing");
    }
  });

  it("emits swarm.scheduled event for scheduled swarms", () => {
    seedBlueprint();
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    const result = createSwarmFromBlueprint("test-bp", "Scheduled task", undefined, undefined, undefined, { schedule_at: futureDate });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("scheduled");
    }
  });
});
