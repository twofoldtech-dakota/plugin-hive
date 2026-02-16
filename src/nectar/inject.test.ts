import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { setNectarKey, getNectar } from "./inject.js";
import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";

describe("Nectar Injection", () => {
  beforeEach(() => {
    freshDb();
  });

  describe("setNectarKey", () => {
    it("sets a new nectar key and bumps epoch", () => {
      const { swarm } = seedSwarm();
      const epochBefore = db.getEpoch();

      const result = setNectarKey(swarm.id, "custom_key", "custom_value");
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.result.key).toBe("custom_key");
      expect(result.result.value).toBe("custom_value");
      expect(result.result.old_value).toBeNull();
      expect(result.result.epoch).toBeGreaterThan(epochBefore);

      // Verify in DB
      const updated = db.getSwarm(swarm.id)!;
      const nectar = safeJsonParse<Record<string, string>>(updated.nectar, {});
      expect(nectar.custom_key).toBe("custom_value");
    });

    it("overrides an existing nectar key and returns old value", () => {
      const { swarm } = seedSwarm();

      // Set initial
      setNectarKey(swarm.id, "status", "draft");

      // Override
      const result = setNectarKey(swarm.id, "status", "final");
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.result.old_value).toBe("draft");
      expect(result.result.value).toBe("final");
    });

    it("emits nectar.injected event", () => {
      const { swarm } = seedSwarm();
      setNectarKey(swarm.id, "test_key", "test_val");

      const events = db.getEventsForSwarm(swarm.id);
      const injected = events.find(e => e.event_type === "nectar.injected");
      expect(injected).toBeDefined();
      const payload = JSON.parse(injected!.payload!);
      expect(payload.key).toBe("test_key");
      expect(payload.value).toBe("test_val");
    });

    it("returns error for non-existent swarm", () => {
      const result = setNectarKey("nonexistent", "key", "value");
      expect(result.success).toBe(false);
    });
  });

  describe("getNectar", () => {
    it("returns all nectar keys", () => {
      const { swarm } = seedSwarm();
      setNectarKey(swarm.id, "extra", "data");

      const result = getNectar(swarm.id);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.result.nectar.task).toBe("Test task");
      expect(result.result.nectar.extra).toBe("data");
    });

    it("returns a single nectar key", () => {
      const { swarm } = seedSwarm();

      const result = getNectar(swarm.id, "task");
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.result.key).toBe("task");
      expect(result.result.value).toBe("Test task");
    });

    it("returns undefined for missing key", () => {
      const { swarm } = seedSwarm();

      const result = getNectar(swarm.id, "missing");
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.result.value).toBeUndefined();
    });

    it("returns error for non-existent swarm", () => {
      const result = getNectar("nonexistent");
      expect(result.success).toBe(false);
    });
  });
});
