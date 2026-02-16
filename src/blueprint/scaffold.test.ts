import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as db from "../db.js";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT, TRIGGER_BLUEPRINT, DAG_BLUEPRINT } from "../test/helpers.js";
import { scaffoldBlueprint } from "./scaffold.js";
import { projectBlueprintsDir } from "../lib/paths.js";

beforeEach(() => {
  freshDb();
});

afterEach(() => {
  const dir = join(projectBlueprintsDir(), "test-scaffold");
  if (existsSync(dir)) rmSync(dir, { recursive: true });
});

describe("scaffoldBlueprint", () => {
  it("creates directory structure with blueprint.yml", () => {
    const result = scaffoldBlueprint("test-scaffold", { location: "project" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.message).toContain("test-scaffold");
    expect(result.dir).toBeTruthy();

    // Verify directory was created
    expect(existsSync(result.dir)).toBe(true);

    // Verify blueprint.yml exists
    expect(existsSync(join(result.dir, "blueprint.yml"))).toBe(true);

    // Verify bee directory structure
    expect(existsSync(join(result.dir, "bees", "worker"))).toBe(true);
    expect(existsSync(join(result.dir, "bees", "worker", "IDENTITY.md"))).toBe(true);
    expect(existsSync(join(result.dir, "bees", "worker", "NATURE.md"))).toBe(true);
  });

  it("returns error for invalid ID (uppercase)", () => {
    const result = scaffoldBlueprint("UPPER-CASE");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid blueprint ID");
    }
  });

  it("returns error for invalid ID starting with a number", () => {
    const result = scaffoldBlueprint("123bad");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid blueprint ID");
    }
  });

  it("returns error if directory already exists", () => {
    // Create the directory first
    const dir = join(projectBlueprintsDir(), "test-scaffold");
    mkdirSync(dir, { recursive: true });

    const result = scaffoldBlueprint("test-scaffold", { location: "project" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already exists");
    }
  });

  it("defaults to project location", () => {
    const result = scaffoldBlueprint("test-scaffold");
    expect(result.success).toBe(true);
    if (!result.success) return;

    // The dir should be under the project blueprints directory
    expect(result.dir).toContain(projectBlueprintsDir());
  });

  it("returns success:true with message and dir on success", () => {
    const result = scaffoldBlueprint("test-scaffold");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
    expect(typeof result.dir).toBe("string");
    expect(result.dir.length).toBeGreaterThan(0);
  });
});
