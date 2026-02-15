import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm } from "../test/helpers.js";
import * as db from "../db.js";
import { stopSwarm } from "./stop.js";

beforeEach(() => {
  freshDb();
});

describe("stopSwarm", () => {
  it("returns error for nonexistent swarm", () => {
    const result = stopSwarm("nonexistent");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("cancels a buzzing swarm", () => {
    const { swarm } = seedSwarm();
    const result = stopSwarm(swarm.id);
    expect(result.success).toBe(true);
    expect(db.getSwarm(swarm.id)!.status).toBe("cancelled");
  });

  it("cancels a paused swarm", () => {
    const { swarm } = seedSwarm();
    db.updateSwarm(swarm.id, { status: "paused" });
    const result = stopSwarm(swarm.id);
    expect(result.success).toBe(true);
    expect(db.getSwarm(swarm.id)!.status).toBe("cancelled");
  });

  it("rejects stopping a completed swarm", () => {
    const { swarm } = seedSwarm();
    db.updateSwarm(swarm.id, { status: "completed" });
    const result = stopSwarm(swarm.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already completed");
    }
  });

  it("rejects stopping a failed swarm", () => {
    const { swarm } = seedSwarm();
    db.updateSwarm(swarm.id, { status: "failed" });
    const result = stopSwarm(swarm.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already failed");
    }
  });

  it("includes swarm number in success message", () => {
    const { swarm } = seedSwarm();
    const result = stopSwarm(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain(`#${swarm.swarm_number}`);
    }
  });
});
