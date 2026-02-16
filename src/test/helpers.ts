import { unlinkSync, existsSync } from "node:fs";
import * as db from "../db.js";
import { dbPath } from "../lib/paths.js";
import type { BlueprintSpec } from "../types.js";

/**
 * Minimal valid blueprint with 1 bee and 1 flight.
 * Use this as a base for seeding test data.
 */
export const MINIMAL_BLUEPRINT: BlueprintSpec = {
  id: "test-bp",
  name: "Test Blueprint",
  version: 1,
  bees: [
    {
      id: "worker",
      role: "coding",
      chamber: { base_dir: "worker", files: {} },
    },
  ],
  flights: [
    {
      id: "do-work",
      bee: "worker",
      type: "single",
      input: "Implement: {{task}}",
      expects: "STATUS: done",
      max_retries: 2,
    },
  ],
};

/**
 * A blueprint with a loop flight and verify_each for testing complex flows.
 */
export const LOOP_BLUEPRINT: BlueprintSpec = {
  id: "test-loop",
  name: "Loop Blueprint",
  version: 1,
  bees: [
    {
      id: "queen",
      role: "analysis",
      chamber: { base_dir: "queen", files: {} },
    },
    {
      id: "worker",
      role: "coding",
      chamber: { base_dir: "worker", files: {} },
    },
    {
      id: "inspector",
      role: "verification",
      chamber: { base_dir: "inspector", files: {} },
    },
  ],
  flights: [
    {
      id: "decompose",
      bee: "queen",
      type: "single",
      input: "Decompose: {{task}}",
      expects: "CELLS_JSON: array",
      max_retries: 2,
    },
    {
      id: "implement",
      bee: "worker",
      type: "loop",
      loop: {
        over: "cells",
        verify_each: true,
        verify_flight: "inspect",
        completion: "all_done",
      },
      input: "Implement: {{current_cell}}",
      expects: "STATUS: done",
      max_retries: 3,
    },
    {
      id: "inspect",
      bee: "inspector",
      type: "single",
      input: "Verify: {{current_cell}}",
      expects: "STATUS: pass/retry",
      max_retries: 2,
    },
    {
      id: "finalize",
      bee: "worker",
      type: "single",
      input: "Finalize: {{task}}",
      expects: "PR_URL: url",
      max_retries: 1,
    },
  ],
};

/**
 * A blueprint with DAG (parallel) flights for testing depends_on logic.
 */
export const DAG_BLUEPRINT: BlueprintSpec = {
  id: "test-dag",
  name: "DAG Blueprint",
  version: 1,
  bees: [
    {
      id: "queen",
      role: "analysis",
      chamber: { base_dir: "queen", files: {} },
    },
    {
      id: "worker",
      role: "coding",
      chamber: { base_dir: "worker", files: {} },
    },
    {
      id: "builder",
      role: "testing",
      chamber: { base_dir: "builder", files: {} },
    },
    {
      id: "inspector",
      role: "verification",
      chamber: { base_dir: "inspector", files: {} },
    },
  ],
  flights: [
    {
      id: "decompose",
      bee: "queen",
      type: "single",
      input: "Decompose: {{task}}",
      expects: "CELLS_JSON: array",
      max_retries: 2,
    },
    {
      id: "implement",
      bee: "worker",
      type: "single",
      depends_on: ["decompose"],
      input: "Implement: {{task}}",
      expects: "STATUS: done",
      max_retries: 2,
    },
    {
      id: "test",
      bee: "builder",
      type: "single",
      depends_on: ["implement"],
      input: "Test: {{task}}",
      expects: "STATUS: pass",
      max_retries: 2,
    },
    {
      id: "lint",
      bee: "inspector",
      type: "single",
      depends_on: ["implement"],
      input: "Lint: {{task}}",
      expects: "STATUS: pass",
      max_retries: 2,
    },
    {
      id: "finalize",
      bee: "worker",
      type: "single",
      depends_on: ["test", "lint"],
      input: "Finalize: {{task}}",
      expects: "PR_URL: url",
      max_retries: 1,
    },
  ],
};

/**
 * A blueprint with triggers for testing swarm chaining.
 */
export const TRIGGER_BLUEPRINT: BlueprintSpec = {
  id: "test-trigger",
  name: "Trigger Blueprint",
  version: 1,
  bees: [
    {
      id: "worker",
      role: "coding",
      chamber: { base_dir: "worker", files: {} },
    },
  ],
  flights: [
    {
      id: "do-work",
      bee: "worker",
      type: "single",
      input: "Implement: {{task}}",
      expects: "STATUS: done",
      max_retries: 2,
    },
  ],
  triggers: [
    {
      on: "swarm.completed",
      blueprint: "test-bp",
      nectar_forward: ["status"],
      task_template: "Follow-up for {{task}}",
    },
  ],
};

/**
 * A blueprint with beekeeper config for testing checkpoints and thresholds.
 */
export const CHECKPOINT_BLUEPRINT: BlueprintSpec = {
  id: "test-checkpoint",
  name: "Checkpoint Blueprint",
  version: 1,
  bees: [
    {
      id: "worker",
      role: "coding",
      chamber: { base_dir: "worker", files: {} },
    },
  ],
  flights: [
    {
      id: "do-work",
      bee: "worker",
      type: "single",
      input: "Implement: {{task}}",
      expects: "STATUS: done",
      max_retries: 2,
    },
  ],
  beekeeper: {
    checkpoint_interval: 1,
  },
};

/**
 * Reset the test database by closing and deleting the DB file, then re-initializing.
 */
export function freshDb(): void {
  db.closeDb();
  const path = dbPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
  // Also clean WAL/SHM files
  for (const suffix of ["-wal", "-shm"]) {
    const walPath = path + suffix;
    if (existsSync(walPath)) {
      unlinkSync(walPath);
    }
  }
  db.initDb();
}

/**
 * Install a blueprint into the test database.
 */
export function seedBlueprint(spec: BlueprintSpec = MINIMAL_BLUEPRINT) {
  return db.insertBlueprint(spec.id, spec.name ?? null, spec.version ?? null, JSON.stringify(spec));
}

/**
 * Create a swarm from a seeded blueprint. Returns the swarm and its flights.
 */
export function seedSwarm(
  blueprintSpec: BlueprintSpec = MINIMAL_BLUEPRINT,
  task = "Test task",
) {
  seedBlueprint(blueprintSpec);
  const nectar = { task, ...(blueprintSpec.nectar ?? {}) };
  const swarm = db.createSwarm(blueprintSpec.id, task, nectar);

  // Collect verify_flight template IDs
  const verifyFlightIds = new Set<string>();
  for (const flight of blueprintSpec.flights) {
    if (flight.type === "loop" && flight.loop?.verify_each && flight.loop?.verify_flight) {
      verifyFlightIds.add(flight.loop.verify_flight);
    }
  }

  // Detect DAG mode
  const pipelineFlights = blueprintSpec.flights.filter(f => !verifyFlightIds.has(f.id));
  const isDAG = pipelineFlights.some(f => f.depends_on && f.depends_on.length > 0);
  const dagRoots = new Set<string>();
  if (isDAG) {
    for (const flight of pipelineFlights) {
      if (!flight.depends_on || flight.depends_on.length === 0) {
        dagRoots.add(flight.id);
      }
    }
  }

  let flightIndex = 0;
  for (const flight of blueprintSpec.flights) {
    if (verifyFlightIds.has(flight.id)) continue;
    const beeId = `${blueprintSpec.id}_${flight.bee}`;
    let status: "pending" | "waiting";
    if (isDAG) {
      status = dagRoots.has(flight.id) ? "pending" : "waiting";
    } else {
      status = flightIndex === 0 ? "pending" : "waiting";
    }
    db.insertFlight(
      swarm.id,
      flight.id,
      beeId,
      flightIndex,
      flight.input,
      flight.expects,
      status,
      flight.max_retries ?? 2,
      flight.type ?? "single",
      flight.loop ? JSON.stringify(flight.loop) : undefined,
      flight.depends_on,
    );
    flightIndex++;
  }

  const flights = db.getFlightsForSwarm(swarm.id);
  return { swarm, flights };
}
