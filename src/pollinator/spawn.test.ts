import { describe, it, expect } from "vitest";
import { getToolsForRole, buildBeePrompt, buildSpawnRequest } from "./spawn.js";
import type { BeeSpec, BlueprintSpec, FlightClaimResult } from "../types.js";

// ── getToolsForRole ─────────────────────────────────────────────────

describe("getToolsForRole", () => {
  it("gives coding role full edit access", () => {
    const config = getToolsForRole("coding");
    expect(config.tools).toContain("Edit");
    expect(config.tools).toContain("Write");
    expect(config.tools).toContain("Bash");
    expect(config.disallowedTools).toHaveLength(0);
  });

  it("gives analysis role read-only access", () => {
    const config = getToolsForRole("analysis");
    expect(config.tools).toContain("Read");
    expect(config.tools).toContain("Grep");
    expect(config.disallowedTools).toContain("Edit");
    expect(config.disallowedTools).toContain("Write");
    expect(config.disallowedTools).toContain("Bash");
  });

  it("gives verification role no write access", () => {
    const config = getToolsForRole("verification");
    expect(config.tools).toContain("Read");
    expect(config.tools).toContain("Bash");
    expect(config.disallowedTools).toContain("Edit");
    expect(config.disallowedTools).toContain("Write");
  });

  it("gives testing role no write access", () => {
    const config = getToolsForRole("testing");
    expect(config.tools).toContain("Bash");
    expect(config.disallowedTools).toContain("Edit");
    expect(config.disallowedTools).toContain("Write");
  });

  it("gives pr role full access", () => {
    const config = getToolsForRole("pr");
    expect(config.tools).toContain("Edit");
    expect(config.tools).toContain("Bash");
    expect(config.disallowedTools).toHaveLength(0);
  });

  it("gives scanning role no write access", () => {
    const config = getToolsForRole("scanning");
    expect(config.disallowedTools).toContain("Edit");
    expect(config.disallowedTools).toContain("Write");
  });

  it("all roles include hive completion tools", () => {
    const roles = ["analysis", "coding", "verification", "testing", "pr", "scanning"] as const;
    for (const role of roles) {
      const config = getToolsForRole(role);
      expect(config.tools).toContain("hive_flight_complete");
      expect(config.tools).toContain("hive_flight_fail");
    }
  });
});

// ── buildBeePrompt ──────────────────────────────────────────────────

describe("buildBeePrompt", () => {
  const baseBee: BeeSpec = {
    id: "worker",
    role: "coding",
    chamber: { base_dir: "worker", files: {} },
  };

  const baseClaim: FlightClaimResult = {
    flight_id: "flight-123",
    swarm_id: "swarm-456",
    resolved_input: "Build the login page",
    expects: "STATUS: done\nFILES_CHANGED: list",
    type: "single",
  };

  it("includes bee identity", () => {
    const prompt = buildBeePrompt(baseBee, baseClaim, "my-bp");
    expect(prompt).toContain("Bee: worker");
    expect(prompt).toContain("Role: coding");
    expect(prompt).toContain("Blueprint: my-bp");
  });

  it("includes flight context", () => {
    const prompt = buildBeePrompt(baseBee, baseClaim, "my-bp");
    expect(prompt).toContain("flight-123");
    expect(prompt).toContain("swarm-456");
    expect(prompt).toContain("Type: single");
  });

  it("includes resolved input and expects", () => {
    const prompt = buildBeePrompt(baseBee, baseClaim, "my-bp");
    expect(prompt).toContain("Build the login page");
    expect(prompt).toContain("STATUS: done");
  });

  it("includes completion instructions", () => {
    const prompt = buildBeePrompt(baseBee, baseClaim, "my-bp");
    expect(prompt).toContain("hive_flight_complete");
    expect(prompt).toContain("hive_flight_fail");
    expect(prompt).toContain("flight-123");
  });

  it("includes bee name and description when provided", () => {
    const bee: BeeSpec = {
      ...baseBee,
      name: "Super Worker",
      description: "Handles all coding tasks efficiently",
    };
    const prompt = buildBeePrompt(bee, baseClaim, "my-bp");
    expect(prompt).toContain("Super Worker");
    expect(prompt).toContain("Handles all coding tasks efficiently");
  });

  it("includes cell context for loop flights", () => {
    const claim: FlightClaimResult = {
      ...baseClaim,
      type: "loop",
      cell: {
        id: "cell-uuid",
        cell_id: "auth-module",
        title: "Authentication Module",
        description: "Implement JWT auth",
        acceptance_criteria: ["Tokens expire", "Refresh works"],
      },
    };
    const prompt = buildBeePrompt(baseBee, claim, "my-bp");
    expect(prompt).toContain("Current Cell");
    expect(prompt).toContain("auth-module");
    expect(prompt).toContain("Authentication Module");
    expect(prompt).toContain("Implement JWT auth");
    expect(prompt).toContain("Tokens expire");
    expect(prompt).toContain("Refresh works");
  });

  it("omits cell section for single flights", () => {
    const prompt = buildBeePrompt(baseBee, baseClaim, "my-bp");
    expect(prompt).not.toContain("Current Cell");
  });
});

// ── buildSpawnRequest ───────────────────────────────────────────────

describe("buildSpawnRequest", () => {
  const bee: BeeSpec = {
    id: "worker",
    role: "coding",
    chamber: { base_dir: "worker", files: {} },
  };

  const claim: FlightClaimResult = {
    flight_id: "flight-abc",
    swarm_id: "swarm-xyz",
    resolved_input: "Do the thing",
    expects: "STATUS: done",
    type: "single",
  };

  const blueprint: BlueprintSpec = {
    id: "test-bp",
    bees: [bee],
    flights: [{ id: "f1", bee: "worker", type: "single", input: "Do", expects: "done", max_retries: 2 }],
  };

  it("builds a complete spawn request", () => {
    const req = buildSpawnRequest(claim, bee, blueprint);
    expect(req.swarmId).toBe("swarm-xyz");
    expect(req.beeId).toBe("worker");
    expect(req.flightId).toBe("flight-abc");
    expect(req.prompt).toContain("Do the thing");
    expect(req.tools).toContain("Edit");
    expect(req.maxTurns).toBeGreaterThan(0);
  });

  it("uses bee model when specified", () => {
    const beeWithModel: BeeSpec = { ...bee, model: "opus" };
    const req = buildSpawnRequest(claim, beeWithModel, blueprint);
    expect(req.model).toBe("opus");
  });

  it("falls back to blueprint polling model", () => {
    const bpWithPolling: BlueprintSpec = {
      ...blueprint,
      polling: { model: "haiku" },
    };
    const req = buildSpawnRequest(claim, bee, bpWithPolling);
    expect(req.model).toBe("haiku");
  });

  it("defaults to sonnet model", () => {
    const req = buildSpawnRequest(claim, bee, blueprint);
    expect(req.model).toBe("sonnet");
  });

  it("computes maxTurns from timeout_seconds", () => {
    const beeWithTimeout: BeeSpec = { ...bee, timeout_seconds: 600 };
    const req = buildSpawnRequest(claim, beeWithTimeout, blueprint);
    expect(req.maxTurns).toBe(60); // 600/10
  });

  it("uses default maxTurns of 30", () => {
    const req = buildSpawnRequest(claim, bee, blueprint);
    expect(req.maxTurns).toBe(30);
  });

  it("includes cell info when present", () => {
    const claimWithCell: FlightClaimResult = {
      ...claim,
      type: "loop",
      cell: {
        id: "cell-uuid",
        cell_id: "auth",
        title: "Auth Module",
        description: "Implement auth",
        acceptance_criteria: [],
      },
    };
    const req = buildSpawnRequest(claimWithCell, bee, blueprint);
    expect(req.cell).toBeDefined();
    expect(req.cell!.id).toBe("cell-uuid");
    expect(req.cell!.cellId).toBe("auth");
    expect(req.cell!.title).toBe("Auth Module");
  });

  it("omits cell info for single flights", () => {
    const req = buildSpawnRequest(claim, bee, blueprint);
    expect(req.cell).toBeUndefined();
  });
});
