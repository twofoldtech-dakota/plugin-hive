import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT, LOOP_BLUEPRINT, DAG_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { createSwarmFromBlueprint } from "./create.js";
import type { BlueprintSpec } from "../types.js";

beforeEach(() => {
  freshDb();
});

describe("createSwarmFromBlueprint", () => {
  it("returns error when blueprint is not installed", () => {
    const result = createSwarmFromBlueprint("nonexistent", "Do something");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not installed");
    }
  });

  it("creates a swarm with correct metadata", () => {
    seedBlueprint();
    const result = createSwarmFromBlueprint("test-bp", "Build auth");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blueprint).toBe("test-bp");
      expect(result.data.task).toBe("Build auth");
      expect(result.data.status).toBe("buzzing");
      expect(result.data.flights).toBe(1);
      expect(result.data.number).toBeGreaterThanOrEqual(1);
    }
  });

  it("creates flights with correct initial statuses", () => {
    const bp: BlueprintSpec = {
      id: "multi-bp",
      bees: [
        { id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } },
      ],
      flights: [
        { id: "f1", bee: "worker", type: "single", input: "First", expects: "done", max_retries: 2 },
        { id: "f2", bee: "worker", type: "single", input: "Second", expects: "done", max_retries: 2 },
        { id: "f3", bee: "worker", type: "single", input: "Third", expects: "done", max_retries: 2 },
      ],
    };
    seedBlueprint(bp);
    const result = createSwarmFromBlueprint("multi-bp", "Task");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flights = db.getFlightsForSwarm(result.data.id);
    expect(flights).toHaveLength(3);
    expect(flights[0].status).toBe("pending");
    expect(flights[1].status).toBe("waiting");
    expect(flights[2].status).toBe("waiting");
    expect(flights[0].flight_index).toBe(0);
    expect(flights[1].flight_index).toBe(1);
    expect(flights[2].flight_index).toBe(2);
  });

  it("skips verify_flight templates in pipeline", () => {
    seedBlueprint(LOOP_BLUEPRINT);
    const result = createSwarmFromBlueprint("test-loop", "Task");
    expect(result.success).toBe(true);
    if (!result.success) return;

    // LOOP_BLUEPRINT has 4 flights but "inspect" is a verify_flight template
    // So only 3 should be inserted: decompose, implement, finalize
    expect(result.data.flights).toBe(3);
    const flights = db.getFlightsForSwarm(result.data.id);
    const flightIds = flights.map(f => f.flight_id);
    expect(flightIds).toContain("decompose");
    expect(flightIds).toContain("implement");
    expect(flightIds).toContain("finalize");
    expect(flightIds).not.toContain("inspect");
  });

  it("initializes nectar with task and blueprint defaults", () => {
    const bp: BlueprintSpec = {
      id: "nectar-bp",
      bees: [
        { id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } },
      ],
      flights: [
        { id: "f1", bee: "worker", type: "single", input: "Do it", expects: "done", max_retries: 1 },
      ],
      nectar: { project: "myapp", language: "typescript" },
    };
    seedBlueprint(bp);
    const result = createSwarmFromBlueprint("nectar-bp", "Build feature");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const swarm = db.getSwarm(result.data.id)!;
    const nectar = JSON.parse(swarm.nectar);
    expect(nectar.task).toBe("Build feature");
    expect(nectar.project).toBe("myapp");
    expect(nectar.language).toBe("typescript");
  });

  it("sets bee_id as blueprintId_beeId", () => {
    seedBlueprint();
    const result = createSwarmFromBlueprint("test-bp", "Task");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flights = db.getFlightsForSwarm(result.data.id);
    expect(flights[0].bee_id).toBe("test-bp_worker");
  });

  it("stores loop config on loop flights", () => {
    seedBlueprint(LOOP_BLUEPRINT);
    const result = createSwarmFromBlueprint("test-loop", "Task");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flights = db.getFlightsForSwarm(result.data.id);
    const loopFlight = flights.find(f => f.type === "loop");
    expect(loopFlight).toBeDefined();
    expect(loopFlight!.loop_config).toBeDefined();
    const config = JSON.parse(loopFlight!.loop_config!);
    expect(config.over).toBe("cells");
    expect(config.verify_each).toBe(true);
  });

  it("emits swarm.started event", () => {
    seedBlueprint();
    const result = createSwarmFromBlueprint("test-bp", "Task");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const events = db.getEventsForSwarm(result.data.id);
    const startEvents = events.filter(e => e.event_type === "swarm.started");
    expect(startEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("auto-increments swarm numbers", () => {
    seedBlueprint();
    const r1 = createSwarmFromBlueprint("test-bp", "First");
    const r2 = createSwarmFromBlueprint("test-bp", "Second");
    expect(r1.success && r2.success).toBe(true);
    if (r1.success && r2.success) {
      expect(r2.data.number).toBe(r1.data.number + 1);
    }
  });

  it("sets DAG roots as pending and dependents as waiting", () => {
    seedBlueprint(DAG_BLUEPRINT);
    const result = createSwarmFromBlueprint("test-dag", "DAG task");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flights = db.getFlightsForSwarm(result.data.id);
    const decompose = flights.find(f => f.flight_id === "decompose")!;
    const implement = flights.find(f => f.flight_id === "implement")!;
    const finalize = flights.find(f => f.flight_id === "finalize")!;

    // Root (no depends_on) should be pending
    expect(decompose.status).toBe("pending");
    // Flights with dependencies should be waiting
    expect(implement.status).toBe("waiting");
    expect(finalize.status).toBe("waiting");
  });

  it("stores depends_on as JSON in DAG flights", () => {
    seedBlueprint(DAG_BLUEPRINT);
    const result = createSwarmFromBlueprint("test-dag", "DAG task");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const flights = db.getFlightsForSwarm(result.data.id);
    const finalize = flights.find(f => f.flight_id === "finalize")!;
    expect(finalize.depends_on).toBeDefined();
    const deps = JSON.parse(finalize.depends_on!);
    expect(deps).toContain("test");
    expect(deps).toContain("lint");
  });
});
