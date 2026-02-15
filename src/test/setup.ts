import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Set HIVE_DATA_DIR to an isolated temp directory BEFORE any module loads paths.ts
const testDir = mkdtempSync(join(tmpdir(), "hive-test-"));
process.env.HIVE_DATA_DIR = testDir;

// Set CLAUDE_PLUGIN_ROOT to project root for blueprint loader tests
process.env.CLAUDE_PLUGIN_ROOT = join(import.meta.dirname, "..", "..");

import { afterAll } from "vitest";
import { closeDb } from "../db.js";

afterAll(() => {
  closeDb();
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures in CI
  }
});
