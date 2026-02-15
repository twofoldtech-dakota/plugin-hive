import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, seedSwarm } from "../test/helpers.js";
import * as db from "../db.js";
import { insertCellsFromParsed, getCellProgress } from "./manage.js";
import type { ParsedCell } from "./parse.js";

beforeEach(() => {
  freshDb();
});

describe("insertCellsFromParsed", () => {
  it("inserts parsed cells into the database", () => {
    const { swarm } = seedSwarm();
    const parsed: ParsedCell[] = [
      { id: "cell-1", title: "First", description: "Do first", acceptance_criteria: ["passes"] },
      { id: "cell-2", title: "Second", description: "Do second", acceptance_criteria: [] },
    ];

    const records = insertCellsFromParsed(swarm.id, parsed);
    expect(records).toHaveLength(2);
    expect(records[0].cell_id).toBe("cell-1");
    expect(records[1].cell_id).toBe("cell-2");

    const fromDb = db.getCellsForSwarm(swarm.id);
    expect(fromDb).toHaveLength(2);
    expect(fromDb[0].cell_index).toBe(0);
    expect(fromDb[1].cell_index).toBe(1);
  });

  it("assigns sequential cell_index", () => {
    const { swarm } = seedSwarm();
    const parsed: ParsedCell[] = [
      { id: "a", title: "A", description: "a", acceptance_criteria: [] },
      { id: "b", title: "B", description: "b", acceptance_criteria: [] },
      { id: "c", title: "C", description: "c", acceptance_criteria: [] },
    ];

    const records = insertCellsFromParsed(swarm.id, parsed);
    expect(records[0].cell_index).toBe(0);
    expect(records[1].cell_index).toBe(1);
    expect(records[2].cell_index).toBe(2);
  });

  it("uses default max_retries of 3", () => {
    const { swarm } = seedSwarm();
    const parsed: ParsedCell[] = [
      { id: "cell-1", title: "First", description: "d", acceptance_criteria: [] },
    ];

    const records = insertCellsFromParsed(swarm.id, parsed);
    expect(records[0].max_retries).toBe(3);
  });

  it("uses custom max_retries", () => {
    const { swarm } = seedSwarm();
    const parsed: ParsedCell[] = [
      { id: "cell-1", title: "First", description: "d", acceptance_criteria: [] },
    ];

    const records = insertCellsFromParsed(swarm.id, parsed, 5);
    expect(records[0].max_retries).toBe(5);
  });

  it("returns empty array for empty input", () => {
    const { swarm } = seedSwarm();
    const records = insertCellsFromParsed(swarm.id, []);
    expect(records).toHaveLength(0);
  });
});

describe("getCellProgress", () => {
  it("returns zeroes when no cells exist", () => {
    const { swarm } = seedSwarm();
    const progress = getCellProgress(swarm.id);
    expect(progress.total).toBe(0);
    expect(progress.pending).toBe(0);
    expect(progress.done).toBe(0);
  });

  it("counts cells by status", () => {
    const { swarm } = seedSwarm();
    const c1 = db.insertCell(swarm.id, 0, "c1", "First", "d", []);
    const c2 = db.insertCell(swarm.id, 1, "c2", "Second", "d", []);
    const c3 = db.insertCell(swarm.id, 2, "c3", "Third", "d", []);
    const c4 = db.insertCell(swarm.id, 3, "c4", "Fourth", "d", []);

    db.updateCell(c1.id, { status: "done" });
    db.updateCell(c2.id, { status: "in_progress" });
    db.updateCell(c3.id, { status: "verifying" });
    // c4 stays pending

    const progress = getCellProgress(swarm.id);
    expect(progress.total).toBe(4);
    expect(progress.done).toBe(1);
    expect(progress.in_progress).toBe(1);
    expect(progress.verifying).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.failed).toBe(0);
  });

  it("counts failed cells", () => {
    const { swarm } = seedSwarm();
    const c1 = db.insertCell(swarm.id, 0, "c1", "First", "d", []);
    db.updateCell(c1.id, { status: "failed" });

    const progress = getCellProgress(swarm.id);
    expect(progress.failed).toBe(1);
  });
});
