import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { setBudget, getBudgetStatus, checkBudget } from "./budget.js";
import * as db from "../db.js";

describe("Budget", () => {
  beforeEach(() => {
    freshDb();
  });

  describe("setBudget", () => {
    it("sets token budget and action on a swarm", () => {
      const { swarm } = seedSwarm();
      const result = setBudget(swarm.id, 10000, "pause");
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.result.token_budget).toBe(10000);
      expect(result.result.budget_action).toBe("pause");
    });

    it("returns error for non-existent swarm", () => {
      const result = setBudget("nonexistent", 10000);
      expect(result.success).toBe(false);
    });

    it("rejects invalid action", () => {
      const { swarm } = seedSwarm();
      const result = setBudget(swarm.id, 10000, "explode");
      expect(result.success).toBe(false);
    });

    it("defaults to warn action", () => {
      const { swarm } = seedSwarm();
      const result = setBudget(swarm.id, 10000);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.result.budget_action).toBe("warn");
    });
  });

  describe("getBudgetStatus", () => {
    it("returns budget status with zero budget (unlimited)", () => {
      const { swarm } = seedSwarm();
      const result = getBudgetStatus(swarm.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.status.token_budget).toBe(0);
      expect(result.status.exceeded).toBe(false);
    });

    it("returns correct utilization after setting budget and recording usage", () => {
      const { swarm, flights } = seedSwarm();
      setBudget(swarm.id, 1000, "warn");
      db.insertUsage(flights[0].id, swarm.id, flights[0].bee_id, 300, 200);

      const result = getBudgetStatus(swarm.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.status.consumed).toBe(500);
      expect(result.status.remaining).toBe(500);
      expect(result.status.utilization).toBe(0.5);
      expect(result.status.exceeded).toBe(false);
    });

    it("flags exceeded when usage exceeds budget", () => {
      const { swarm, flights } = seedSwarm();
      setBudget(swarm.id, 100, "cancel");
      db.insertUsage(flights[0].id, swarm.id, flights[0].bee_id, 80, 50);

      const result = getBudgetStatus(swarm.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.status.exceeded).toBe(true);
    });

    it("returns error for non-existent swarm", () => {
      const result = getBudgetStatus("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  describe("checkBudget", () => {
    it("does nothing when no budget is set", () => {
      const { swarm } = seedSwarm();
      // Should not throw
      checkBudget(swarm.id);
      const updated = db.getSwarm(swarm.id)!;
      expect(updated.status).toBe("buzzing");
    });

    it("pauses swarm when budget exceeded and action=pause", () => {
      const { swarm, flights } = seedSwarm();
      setBudget(swarm.id, 100, "pause");
      db.insertUsage(flights[0].id, swarm.id, flights[0].bee_id, 80, 50);

      checkBudget(swarm.id);
      const updated = db.getSwarm(swarm.id)!;
      expect(updated.status).toBe("paused");
    });

    it("cancels swarm when budget exceeded and action=cancel", () => {
      const { swarm, flights } = seedSwarm();
      setBudget(swarm.id, 100, "cancel");
      db.insertUsage(flights[0].id, swarm.id, flights[0].bee_id, 80, 50);

      checkBudget(swarm.id);
      const updated = db.getSwarm(swarm.id)!;
      expect(updated.status).toBe("cancelled");
    });

    it("emits budget_exceeded event", () => {
      const { swarm, flights } = seedSwarm();
      setBudget(swarm.id, 100, "warn");
      db.insertUsage(flights[0].id, swarm.id, flights[0].bee_id, 80, 50);

      checkBudget(swarm.id);
      const events = db.getEventsForSwarm(swarm.id);
      const exceeded = events.find(e => e.event_type === "swarm.budget_exceeded");
      expect(exceeded).toBeDefined();
    });

    it("emits budget_warning at 80% utilization", () => {
      const { swarm, flights } = seedSwarm();
      setBudget(swarm.id, 1000, "warn");
      db.insertUsage(flights[0].id, swarm.id, flights[0].bee_id, 500, 350); // 850/1000 = 85%

      checkBudget(swarm.id);
      const events = db.getEventsForSwarm(swarm.id);
      const warning = events.find(e => e.event_type === "swarm.budget_warning");
      expect(warning).toBeDefined();
    });
  });
});
