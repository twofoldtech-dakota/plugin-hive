import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./loader.js", () => ({
  loadBlueprint: vi.fn(),
}));

vi.mock("../db.js", () => ({
  insertBlueprint: vi.fn(),
  insertBlueprintSource: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../lib/paths.js", () => ({
  blueprintDir: vi.fn((id: string) => `/tmp/test-hive/blueprints/${id}`),
  blueprintsDir: vi.fn(() => "/tmp/test-hive/blueprints"),
  bundledBlueprintsDir: vi.fn(() => "/tmp/test-hive/bundled"),
  projectBlueprintsDir: vi.fn(() => "/tmp/test-hive/project"),
  ensureDir: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { exportBlueprint, importBlueprint } from "./export.js";
import { loadBlueprint } from "./loader.js";
import * as db from "../db.js";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";

const mockLoad = vi.mocked(loadBlueprint);
const mockDb = vi.mocked(db);
const mockExists = vi.mocked(existsSync);
const mockRead = vi.mocked(readFileSync);
const mockWrite = vi.mocked(writeFileSync);
const mockReaddir = vi.mocked(readdirSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exportBlueprint", () => {
  it("returns error when blueprint dir not found", () => {
    mockExists.mockReturnValue(false);
    const result = exportBlueprint("nonexistent");
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("not found");
  });

  it("exports a blueprint successfully", () => {
    // Blueprint exists in bundled dir
    mockExists.mockImplementation((path: any) => {
      if (String(path).includes("bundled/test-bp/blueprint.yml")) return true;
      if (String(path) === "/tmp/output") return true;
      return false;
    });
    mockLoad.mockReturnValue({
      success: true,
      blueprint: { id: "test-bp", bees: [], flights: [] } as any,
    });
    mockReaddir.mockReturnValue([
      { name: "blueprint.yml", isDirectory: () => false, isFile: () => true } as any,
    ]);
    mockRead.mockReturnValue("id: test-bp\n");

    const result = exportBlueprint("test-bp", "/tmp/output");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.path).toContain("test-bp.hive-blueprint.json");
      expect(mockWrite).toHaveBeenCalled();
    }
  });
});

describe("importBlueprint", () => {
  it("returns error when file not found", () => {
    mockExists.mockReturnValue(false);
    const result = importBlueprint("/nonexistent.json");
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("File not found");
  });

  it("returns error for invalid format version", () => {
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(JSON.stringify({ format_version: 99 }));
    const result = importBlueprint("/tmp/bad.json");
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("Unsupported format");
  });

  it("imports a valid bundle", () => {
    const bundle = {
      format_version: 1,
      blueprint_id: "imported-bp",
      exported_at: "2026-02-16T00:00:00Z",
      spec: { id: "imported-bp", bees: [], flights: [] },
      files: {
        "blueprint.yml": Buffer.from("id: imported-bp\n").toString("base64"),
      },
    };
    mockExists.mockReturnValue(true);
    mockRead.mockReturnValue(JSON.stringify(bundle));
    mockLoad.mockReturnValue({
      success: true,
      blueprint: { id: "imported-bp", bees: [], flights: [] } as any,
    });

    const result = importBlueprint("/tmp/imported-bp.hive-blueprint.json");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.blueprint_id).toBe("imported-bp");
      expect(mockDb.insertBlueprint).toHaveBeenCalled();
      expect(mockDb.insertBlueprintSource).toHaveBeenCalledWith("imported-bp", "package", "/tmp/imported-bp.hive-blueprint.json");
    }
  });
});
