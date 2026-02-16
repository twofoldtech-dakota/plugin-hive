import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadBlueprint } from "./loader.js";
import { blueprintDir, blueprintsDir, ensureDir } from "../lib/paths.js";
import { bundledBlueprintsDir, projectBlueprintsDir } from "../lib/paths.js";
import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import { recordVersion } from "./version.js";
import type { BlueprintBundle, BlueprintSpec } from "../types.js";

// ── Export ────────────────────────────────────────────────────────────

export type ExportResult =
  | { success: true; message: string; path: string }
  | { success: false; error: string };

/**
 * Export an installed blueprint as a portable .hive-blueprint.json bundle.
 * Includes the YAML spec and all bee identity/nature files as base64.
 */
export function exportBlueprint(blueprintId: string, outputDir?: string): ExportResult {
  // Find the blueprint directory
  const dir = findBlueprintDir(blueprintId);
  if (!dir) {
    return { success: false, error: `Blueprint directory not found for "${blueprintId}". Is it installed?` };
  }

  // Load and validate the spec
  const loadResult = loadBlueprint(blueprintId);
  if (!loadResult.success) {
    return { success: false, error: `Failed to load blueprint: ${loadResult.error}` };
  }

  // Collect all files in the blueprint directory
  const files: Record<string, string> = {};
  collectFiles(dir, dir, files);

  const bundle: BlueprintBundle = {
    format_version: 1,
    blueprint_id: blueprintId,
    exported_at: new Date().toISOString(),
    spec: loadResult.blueprint,
    files,
  };

  const outDir = outputDir ?? process.cwd();
  ensureDir(outDir);
  const outPath = join(outDir, `${blueprintId}.hive-blueprint.json`);

  writeFileSync(outPath, JSON.stringify(bundle, null, 2), "utf-8");
  logger.info("Blueprint exported", { blueprintId, path: outPath, fileCount: Object.keys(files).length });

  return {
    success: true,
    message: `Exported "${blueprintId}" to ${outPath} (${Object.keys(files).length} files)`,
    path: outPath,
  };
}

// ── Import ────────────────────────────────────────────────────────────

export type ImportResult =
  | { success: true; message: string; blueprint_id: string }
  | { success: false; error: string };

/**
 * Import a blueprint from a .hive-blueprint.json bundle.
 * Validates the manifest, extracts files, and installs the blueprint.
 */
export function importBlueprint(path: string): ImportResult {
  if (!existsSync(path)) {
    return { success: false, error: `File not found: ${path}` };
  }

  let bundle: BlueprintBundle;
  try {
    const content = readFileSync(path, "utf-8");
    bundle = JSON.parse(content);
  } catch (err) {
    return { success: false, error: `Failed to parse bundle: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Validate manifest
  if (!bundle.format_version || bundle.format_version !== 1) {
    return { success: false, error: `Unsupported format version: ${bundle.format_version}` };
  }
  if (!bundle.blueprint_id || !bundle.spec || !bundle.files) {
    return { success: false, error: "Invalid bundle: missing blueprint_id, spec, or files" };
  }

  const targetDir = blueprintDir(bundle.blueprint_id);
  ensureDir(targetDir);

  // Extract files
  for (const [relPath, base64Content] of Object.entries(bundle.files)) {
    // Prevent path traversal
    const normalized = relPath.replace(/\.\./g, "").replace(/^\//, "");
    const fullPath = join(targetDir, normalized);
    const parentDir = join(fullPath, "..");
    ensureDir(parentDir);
    const content = Buffer.from(base64Content, "base64").toString("utf-8");
    writeFileSync(fullPath, content, "utf-8");
  }

  // Validate by loading
  const loadResult = loadBlueprint(bundle.blueprint_id);
  if (!loadResult.success) {
    return { success: false, error: `Extracted blueprint failed validation: ${loadResult.error}` };
  }

  // Install to database
  const spec = loadResult.blueprint;
  db.insertBlueprint(spec.id, spec.name ?? null, spec.version ?? null, JSON.stringify(spec));
  recordVersion(spec.id, spec);

  // Record source
  db.insertBlueprintSource(spec.id, "package", path);

  logger.info("Blueprint imported", { blueprintId: bundle.blueprint_id, fileCount: Object.keys(bundle.files).length });

  return {
    success: true,
    message: `Imported "${bundle.blueprint_id}" (${Object.keys(bundle.files).length} files)`,
    blueprint_id: bundle.blueprint_id,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function findBlueprintDir(blueprintId: string): string | null {
  // Check project-local
  const projectDir = join(projectBlueprintsDir(), blueprintId);
  if (existsSync(join(projectDir, "blueprint.yml"))) return projectDir;

  // Check installed
  const installedDir = blueprintDir(blueprintId);
  if (existsSync(join(installedDir, "blueprint.yml"))) return installedDir;

  // Check bundled
  const bundledDir = join(bundledBlueprintsDir(), blueprintId);
  if (existsSync(join(bundledDir, "blueprint.yml"))) return bundledDir;

  return null;
}

function collectFiles(baseDir: string, currentDir: string, files: Record<string, string>): void {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(baseDir, fullPath, files);
    } else {
      const relPath = relative(baseDir, fullPath);
      const content = readFileSync(fullPath, "utf-8");
      files[relPath] = Buffer.from(content, "utf-8").toString("base64");
    }
  }
}
