import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { BlueprintSpecSchema, type ValidatedBlueprintSpec } from "./schema.js";
import { bundledBlueprintsDir, blueprintsDir, blueprintDir } from "../lib/paths.js";
import { logger } from "../lib/logger.js";

export type LoadResult =
  | { success: true; blueprint: ValidatedBlueprintSpec }
  | { success: false; error: string };

/** Parse and validate a blueprint YAML string */
export function parseBlueprint(yamlContent: string): LoadResult {
  let raw: unknown;
  try {
    raw = parseYaml(yamlContent);
  } catch (e) {
    return { success: false, error: `Invalid YAML: ${e instanceof Error ? e.message : String(e)}` };
  }

  const result = BlueprintSpecSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    return { success: false, error: `Blueprint validation failed:\n${issues}` };
  }

  return { success: true, blueprint: result.data };
}

/** Load a blueprint from a directory containing blueprint.yml */
export function loadBlueprintFromDir(dir: string): LoadResult {
  const ymlPath = join(dir, "blueprint.yml");
  if (!existsSync(ymlPath)) {
    return { success: false, error: `No blueprint.yml found in ${dir}` };
  }

  const content = readFileSync(ymlPath, "utf-8");
  return parseBlueprint(content);
}

/** Discover all bundled blueprints shipped with the plugin */
export function discoverBundledBlueprints(): { id: string; dir: string }[] {
  const dir = bundledBlueprintsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => existsSync(join(dir, entry.name, "blueprint.yml")))
    .map(entry => ({ id: entry.name, dir: join(dir, entry.name) }));
}

/** Discover all installed blueprints */
export function discoverInstalledBlueprints(): { id: string; dir: string }[] {
  const dir = blueprintsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => existsSync(join(dir, entry.name, "blueprint.yml")))
    .map(entry => ({ id: entry.name, dir: join(dir, entry.name) }));
}

/** Load a specific blueprint by ID — checks installed first, then bundled */
export function loadBlueprint(blueprintId: string): LoadResult {
  // Check installed
  const installedDir = blueprintDir(blueprintId);
  if (existsSync(join(installedDir, "blueprint.yml"))) {
    logger.info("Loading installed blueprint", { id: blueprintId, dir: installedDir });
    return loadBlueprintFromDir(installedDir);
  }

  // Check bundled
  const bundledDir = join(bundledBlueprintsDir(), blueprintId);
  if (existsSync(join(bundledDir, "blueprint.yml"))) {
    logger.info("Loading bundled blueprint", { id: blueprintId, dir: bundledDir });
    return loadBlueprintFromDir(bundledDir);
  }

  return { success: false, error: `Blueprint "${blueprintId}" not found` };
}
