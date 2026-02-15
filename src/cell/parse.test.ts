import { describe, it, expect } from "vitest";
import { parseCellsJson } from "./parse.js";

describe("parseCellsJson", () => {
  const validCell = {
    id: "cell-1",
    title: "Add auth middleware",
    description: "Create JWT validation middleware",
    acceptance_criteria: ["Validates tokens", "Rejects expired tokens"],
  };

  it("parses valid single-line CELLS_JSON", () => {
    const output = `Some preamble\nCELLS_JSON: ${JSON.stringify([validCell])}`;
    const result = parseCellsJson(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.cells).toHaveLength(1);
      expect(result.cells[0].id).toBe("cell-1");
    }
  });

  it("parses valid multi-line CELLS_JSON", () => {
    const json = JSON.stringify([validCell], null, 2);
    const output = `Preamble\nCELLS_JSON:\n${json}`;
    const result = parseCellsJson(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.cells).toHaveLength(1);
    }
  });

  it("parses multiple cells", () => {
    const cells = [
      validCell,
      { id: "cell-2", title: "Add routes", description: "Create API routes", acceptance_criteria: [] },
    ];
    const output = `CELLS_JSON: ${JSON.stringify(cells)}`;
    const result = parseCellsJson(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.cells).toHaveLength(2);
    }
  });

  it("returns error when no CELLS_JSON found", () => {
    const result = parseCellsJson("Just some text output");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No CELLS_JSON found");
    }
  });

  it("returns error for invalid JSON", () => {
    const result = parseCellsJson("CELLS_JSON: {not valid json");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("returns error for non-array JSON", () => {
    const result = parseCellsJson(`CELLS_JSON: ${JSON.stringify({ id: "cell-1" })}`);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be a JSON array");
    }
  });

  it("returns error for empty array", () => {
    const result = parseCellsJson("CELLS_JSON: []");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("empty");
    }
  });

  it("returns error when cell missing required id field", () => {
    const cell = { title: "No ID", description: "Missing id", acceptance_criteria: [] };
    const result = parseCellsJson(`CELLS_JSON: ${JSON.stringify([cell])}`);
    expect(result.success).toBe(false);
  });

  it("returns error when cell missing required title field", () => {
    const cell = { id: "c1", description: "Missing title", acceptance_criteria: [] };
    const result = parseCellsJson(`CELLS_JSON: ${JSON.stringify([cell])}`);
    expect(result.success).toBe(false);
  });

  it("returns error when cell missing required description field", () => {
    const cell = { id: "c1", title: "No desc", acceptance_criteria: [] };
    const result = parseCellsJson(`CELLS_JSON: ${JSON.stringify([cell])}`);
    expect(result.success).toBe(false);
  });

  it("tolerates extra fields on cells", () => {
    const cell = { ...validCell, extra_field: "should be ignored" };
    const result = parseCellsJson(`CELLS_JSON: ${JSON.stringify([cell])}`);
    expect(result.success).toBe(true);
  });

  it("handles CELLS_JSON not at start of line (should not match)", () => {
    const result = parseCellsJson(`  CELLS_JSON: ${JSON.stringify([validCell])}`);
    // Regex uses ^, so indented line won't match
    expect(result.success).toBe(false);
  });
});
