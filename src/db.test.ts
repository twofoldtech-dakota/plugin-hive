import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "./test/helpers.js";
import * as db from "./db.js";

beforeEach(() => {
  freshDb();
});

// ── Blueprints ──────────────────────────────────────────────────────

describe("blueprints", () => {
  it("inserts and retrieves a blueprint", () => {
    const bp = db.insertBlueprint("test-bp", "Test", 1, '{"id":"test-bp"}');
    expect(bp.id).toBe("test-bp");
    expect(bp.name).toBe("Test");
    expect(bp.version).toBe(1);

    const fetched = db.getBlueprint("test-bp");
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe("test-bp");
  });

  it("returns undefined for missing blueprint", () => {
    expect(db.getBlueprint("nonexistent")).toBeUndefined();
  });

  it("lists all blueprints", () => {
    db.insertBlueprint("bp-1", "First", 1, "{}");
    db.insertBlueprint("bp-2", "Second", 1, "{}");
    const list = db.listBlueprints();
    expect(list).toHaveLength(2);
    const ids = list.map(b => b.id);
    expect(ids).toContain("bp-1");
    expect(ids).toContain("bp-2");
  });

  it("upserts via INSERT OR REPLACE", () => {
    db.insertBlueprint("bp", "v1", 1, "{}");
    db.insertBlueprint("bp", "v2", 2, '{"updated":true}');
    const bp = db.getBlueprint("bp");
    expect(bp!.name).toBe("v2");
    expect(bp!.version).toBe(2);
  });

  it("deletes a blueprint", () => {
    db.insertBlueprint("bp", "Test", 1, "{}");
    db.deleteBlueprint("bp");
    expect(db.getBlueprint("bp")).toBeUndefined();
  });
});

// ── Swarms ─────────────────────────────────────────────────────────

describe("swarms", () => {
  beforeEach(() => {
    seedBlueprint();
  });

  it("creates a swarm with auto-incrementing number", () => {
    const s1 = db.createSwarm("test-bp", "Task 1");
    const s2 = db.createSwarm("test-bp", "Task 2");
    expect(s1.swarm_number).toBe(1);
    expect(s2.swarm_number).toBe(2);
  });

  it("creates a swarm with initial nectar", () => {
    const swarm = db.createSwarm("test-bp", "Task", { task: "hello" });
    expect(JSON.parse(swarm.nectar)).toEqual({ task: "hello" });
  });

  it("gets swarm by ID", () => {
    const swarm = db.createSwarm("test-bp", "Task");
    const fetched = db.getSwarm(swarm.id);
    expect(fetched).toBeDefined();
    expect(fetched!.task).toBe("Task");
  });

  it("gets swarm by number", () => {
    const swarm = db.createSwarm("test-bp", "Task");
    const fetched = db.getSwarmByNumber(swarm.swarm_number);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(swarm.id);
  });

  it("finds swarm by number string", () => {
    const swarm = db.createSwarm("test-bp", "Task");
    expect(db.findSwarm("1")!.id).toBe(swarm.id);
  });

  it("finds swarm by UUID prefix", () => {
    const swarm = db.createSwarm("test-bp", "Task");
    const prefix = swarm.id.slice(0, 8);
    expect(db.findSwarm(prefix)!.id).toBe(swarm.id);
  });

  it("finds swarm by task substring", () => {
    db.createSwarm("test-bp", "Build a login page");
    const found = db.findSwarm("login");
    expect(found).toBeDefined();
    expect(found!.task).toContain("login");
  });

  it("returns undefined when find has no match", () => {
    expect(db.findSwarm("zzz-nonexistent")).toBeUndefined();
  });

  it("lists swarms with status filter", () => {
    db.createSwarm("test-bp", "Task 1");
    const s2 = db.createSwarm("test-bp", "Task 2");
    db.updateSwarm(s2.id, { status: "completed" });

    const buzzing = db.listSwarms({ status: "buzzing" });
    expect(buzzing).toHaveLength(1);
    const completed = db.listSwarms({ status: "completed" });
    expect(completed).toHaveLength(1);
  });

  it("lists swarms with limit", () => {
    db.createSwarm("test-bp", "Task 1");
    db.createSwarm("test-bp", "Task 2");
    db.createSwarm("test-bp", "Task 3");
    const limited = db.listSwarms({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("updates swarm status", () => {
    const swarm = db.createSwarm("test-bp", "Task");
    db.updateSwarm(swarm.id, { status: "completed" });
    expect(db.getSwarm(swarm.id)!.status).toBe("completed");
  });

  it("updates swarm nectar", () => {
    const swarm = db.createSwarm("test-bp", "Task");
    db.updateSwarm(swarm.id, { nectar: '{"key":"val"}' });
    expect(JSON.parse(db.getSwarm(swarm.id)!.nectar)).toEqual({ key: "val" });
  });
});

// ── Flights ────────────────────────────────────────────────────────

describe("flights", () => {
  let swarmId: string;

  beforeEach(() => {
    seedBlueprint();
    const swarm = db.createSwarm("test-bp", "Task");
    swarmId = swarm.id;
  });

  it("inserts and retrieves a flight", () => {
    const flight = db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "pending", 2);
    expect(flight.flight_id).toBe("f1");
    expect(flight.status).toBe("pending");
    const fetched = db.getFlight(flight.id);
    expect(fetched).toBeDefined();
  });

  it("gets flights for swarm ordered by index", () => {
    db.insertFlight(swarmId, "f2", "test-bp_worker", 1, "input", "expects", "waiting", 2);
    db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "pending", 2);
    const flights = db.getFlightsForSwarm(swarmId);
    expect(flights[0].flight_index).toBe(0);
    expect(flights[1].flight_index).toBe(1);
  });

  it("gets flight by flight_id", () => {
    db.insertFlight(swarmId, "decompose", "test-bp_queen", 0, "input", "expects", "pending", 2);
    const found = db.getFlightByFlightId(swarmId, "decompose");
    expect(found).toBeDefined();
    expect(found!.flight_id).toBe("decompose");
  });

  it("peeks pending flights for a bee", () => {
    db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "pending", 2);
    db.insertFlight(swarmId, "f2", "test-bp_worker", 1, "input", "expects", "waiting", 2);
    expect(db.peekFlightsForBee("test-bp_worker")).toBe(1);
  });

  it("batch peeks flights for multiple bees", () => {
    db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "pending", 2);
    db.insertFlight(swarmId, "f2", "test-bp_queen", 1, "input", "expects", "pending", 2);
    const counts = db.peekFlightsForBees(["test-bp_worker", "test-bp_queen", "test-bp_inspector"]);
    expect(counts.get("test-bp_worker")).toBe(1);
    expect(counts.get("test-bp_queen")).toBe(1);
    expect(counts.get("test-bp_inspector")).toBe(0);
  });

  it("claims a pending flight", () => {
    db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "pending", 2);
    const claimed = db.claimFlightForBee("test-bp_worker");
    expect(claimed).toBeDefined();
    expect(claimed!.status).toBe("in_flight");
    // Verify it's actually updated in DB
    expect(db.getFlight(claimed!.id)!.status).toBe("in_flight");
  });

  it("returns undefined when no pending flights to claim", () => {
    db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "waiting", 2);
    expect(db.claimFlightForBee("test-bp_worker")).toBeUndefined();
  });

  it("updates flight fields", () => {
    const flight = db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "in_flight", 2);
    db.updateFlight(flight.id, { status: "done", output: "STATUS: done" });
    const updated = db.getFlight(flight.id)!;
    expect(updated.status).toBe("done");
    expect(updated.output).toBe("STATUS: done");
  });

  it("inserts verification flights", () => {
    const vf = db.insertVerificationFlight(swarmId, "vf-1", "test-bp_inspector", 1, "input", "expects", 1, '{"parent":"x"}');
    expect(vf.verify_meta).toBe('{"parent":"x"}');
    expect(vf.status).toBe("pending");
  });

  it("gets verification flights for swarm", () => {
    db.insertFlight(swarmId, "f1", "test-bp_worker", 0, "input", "expects", "pending", 2);
    db.insertVerificationFlight(swarmId, "vf-1", "test-bp_inspector", 1, "input", "expects", 1, '{"parent":"x"}');
    const vfs = db.getVerificationFlightsForSwarm(swarmId);
    expect(vfs).toHaveLength(1);
    expect(vfs[0].flight_id).toBe("vf-1");
  });
});

// ── Cells ──────────────────────────────────────────────────────────

describe("cells", () => {
  let swarmId: string;

  beforeEach(() => {
    seedBlueprint();
    const swarm = db.createSwarm("test-bp", "Task");
    swarmId = swarm.id;
  });

  it("inserts and retrieves a cell", () => {
    const cell = db.insertCell(swarmId, 0, "cell-1", "Title", "Desc", ["criterion"]);
    expect(cell.cell_id).toBe("cell-1");
    expect(cell.status).toBe("pending");
    const fetched = db.getCell(cell.id);
    expect(fetched).toBeDefined();
  });

  it("gets cells for swarm ordered by index", () => {
    db.insertCell(swarmId, 1, "cell-2", "Second", "Desc 2", []);
    db.insertCell(swarmId, 0, "cell-1", "First", "Desc 1", []);
    const cells = db.getCellsForSwarm(swarmId);
    expect(cells[0].cell_index).toBe(0);
    expect(cells[1].cell_index).toBe(1);
  });

  it("gets next pending cell by index order", () => {
    const c1 = db.insertCell(swarmId, 0, "cell-1", "First", "Desc", []);
    db.insertCell(swarmId, 1, "cell-2", "Second", "Desc", []);
    db.updateCell(c1.id, { status: "done" });

    const next = db.getNextPendingCell(swarmId);
    expect(next).toBeDefined();
    expect(next!.cell_id).toBe("cell-2");
  });

  it("returns undefined when no pending cells", () => {
    const c = db.insertCell(swarmId, 0, "cell-1", "Title", "Desc", []);
    db.updateCell(c.id, { status: "done" });
    expect(db.getNextPendingCell(swarmId)).toBeUndefined();
  });

  it("updates cell fields", () => {
    const cell = db.insertCell(swarmId, 0, "cell-1", "Title", "Desc", []);
    db.updateCell(cell.id, { status: "in_progress", output: "working" });
    const updated = db.getCell(cell.id)!;
    expect(updated.status).toBe("in_progress");
    expect(updated.output).toBe("working");
  });
});

// ── Events ─────────────────────────────────────────────────────────

describe("events", () => {
  it("inserts and retrieves events", () => {
    seedBlueprint();
    const swarm = db.createSwarm("test-bp", "Task");
    const event = db.insertEvent("swarm.started", swarm.id, { test: true });
    expect(event.event_type).toBe("swarm.started");

    const events = db.getEventsForSwarm(swarm.id);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("gets recent events with limit", () => {
    for (let i = 0; i < 5; i++) {
      db.insertEvent("swarm.started" as any, undefined, { i });
    }
    const recent = db.getRecentEvents(3);
    expect(recent).toHaveLength(3);
  });
});

// ── Beekeeper Checks ──────────────────────────────────────────────

describe("beekeeper checks", () => {
  it("inserts and retrieves checks", () => {
    const check = db.insertBeekeeperCheck(2, 1, "Found 2 issues", { details: true });
    expect(check.issues_found).toBe(2);
    expect(check.actions_taken).toBe(1);

    const recent = db.getRecentBeekeeperChecks(5);
    expect(recent).toHaveLength(1);
  });
});

// ── Utility Queries ────────────────────────────────────────────────

describe("utility queries", () => {
  it("getStuckFlights returns empty when no stuck flights", () => {
    expect(db.getStuckFlights()).toHaveLength(0);
  });

  it("getStalledSwarms returns empty when no stalled swarms", () => {
    expect(db.getStalledSwarms()).toHaveLength(0);
  });

  it("getZombieSwarms detects zombie", () => {
    seedBlueprint();
    const swarm = db.createSwarm("test-bp", "Task");
    // All flights done but swarm still buzzing
    db.insertFlight(swarm.id, "f1", "test-bp_worker", 0, "input", "expects", "done", 2);
    const zombies = db.getZombieSwarms();
    expect(zombies.length).toBeGreaterThanOrEqual(1);
  });

  it("getExhaustedFlights returns flights with high abandon count", () => {
    seedBlueprint();
    const swarm = db.createSwarm("test-bp", "Task");
    const flight = db.insertFlight(swarm.id, "f1", "test-bp_worker", 0, "input", "expects", "pending", 2);
    db.updateFlight(flight.id, { abandoned_count: 5 });
    const exhausted = db.getExhaustedFlights();
    expect(exhausted).toHaveLength(1);
  });
});
