import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { checkConcurrency, promoteQueuedSwarms } from "./enforce.js";
import { setGlobalConfig } from "../config/global.js";

describe("Concurrency Enforcement", () => {
  beforeEach(() => {
    freshDb();
    seedBlueprint(MINIMAL_BLUEPRINT);
  });

  describe("checkConcurrency", () => {
    it("allows when under limit", () => {
      const result = checkConcurrency(MINIMAL_BLUEPRINT.id);
      expect(result.allowed).toBe(true);
    });

    it("blocks when at global limit", () => {
      setGlobalConfig("max_concurrent_swarms", "2");

      // Create 2 buzzing swarms
      db.createSwarm(MINIMAL_BLUEPRINT.id, "Task 1");
      db.createSwarm(MINIMAL_BLUEPRINT.id, "Task 2");

      const result = checkConcurrency(MINIMAL_BLUEPRINT.id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Global concurrency limit");
    });

    it("allows unlimited when set to 0", () => {
      setGlobalConfig("max_concurrent_swarms", "0");

      for (let i = 0; i < 10; i++) {
        db.createSwarm(MINIMAL_BLUEPRINT.id, `Task ${i}`);
      }

      const result = checkConcurrency(MINIMAL_BLUEPRINT.id);
      expect(result.allowed).toBe(true);
    });

    it("respects blueprint-level concurrency", () => {
      const bpWithConcurrency = {
        ...MINIMAL_BLUEPRINT,
        id: "limited-bp",
        concurrency: { max_swarms: 1 },
      };
      seedBlueprint(bpWithConcurrency);
      setGlobalConfig("max_concurrent_swarms", "10");

      db.createSwarm("limited-bp", "Task 1");

      const result = checkConcurrency("limited-bp");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Blueprint");
    });
  });

  describe("promoteQueuedSwarms", () => {
    it("promotes queued swarms when slots open", () => {
      setGlobalConfig("max_concurrent_swarms", "2");

      // Create a buzzing swarm and a queued swarm
      db.createSwarm(MINIMAL_BLUEPRINT.id, "Buzzing task");
      const queued = db.createSwarm(MINIMAL_BLUEPRINT.id, "Queued task");
      db.updateSwarm(queued.id, { status: "queued" });

      const promoted = promoteQueuedSwarms();
      expect(promoted).toBe(1);

      const updated = db.getSwarm(queued.id);
      expect(updated?.status).toBe("buzzing");
    });

    it("does not promote when at limit", () => {
      setGlobalConfig("max_concurrent_swarms", "1");

      db.createSwarm(MINIMAL_BLUEPRINT.id, "Buzzing task");
      const queued = db.createSwarm(MINIMAL_BLUEPRINT.id, "Queued task");
      db.updateSwarm(queued.id, { status: "queued" });

      const promoted = promoteQueuedSwarms();
      expect(promoted).toBe(0);
    });

    it("promotes highest priority first", () => {
      setGlobalConfig("max_concurrent_swarms", "2");

      // Two queued swarms with different priorities
      const low = db.createSwarm(MINIMAL_BLUEPRINT.id, "Low priority", {}, undefined, { priority: 3 });
      db.updateSwarm(low.id, { status: "queued" });

      const high = db.createSwarm(MINIMAL_BLUEPRINT.id, "High priority", {}, undefined, { priority: 8 });
      db.updateSwarm(high.id, { status: "queued" });

      // Only one slot open
      setGlobalConfig("max_concurrent_swarms", "1");
      const promoted = promoteQueuedSwarms();
      expect(promoted).toBe(1);

      // High priority should be promoted
      expect(db.getSwarm(high.id)?.status).toBe("buzzing");
      expect(db.getSwarm(low.id)?.status).toBe("queued");
    });
  });
});
