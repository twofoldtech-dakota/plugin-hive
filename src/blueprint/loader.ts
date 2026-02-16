import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { BlueprintSpecSchema, type ValidatedBlueprintSpec } from "./schema.js";
import { bundledBlueprintsDir, blueprintsDir, blueprintDir, projectBlueprintsDir } from "../lib/paths.js";
import { logger } from "../lib/logger.js";
import { resolveInheritance } from "./inherit.js";

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

  // Resolve inheritance if extends is set
  if (result.data.extends) {
    const inheritResult = resolveInheritance(result.data);
    if (!inheritResult.success) {
      return { success: false, error: inheritResult.error };
    }
    // Re-validate the merged spec
    const revalidated = BlueprintSpecSchema.safeParse(inheritResult.spec);
    if (!revalidated.success) {
      const issues = revalidated.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      return { success: false, error: `Merged blueprint validation failed:\n${issues}` };
    }
    return { success: true, blueprint: revalidated.data };
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

/** Discover project-local blueprints in {projectDir}/.hive/blueprints/ */
export function discoverProjectBlueprints(): { id: string; dir: string }[] {
  const dir = projectBlueprintsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => existsSync(join(dir, entry.name, "blueprint.yml")))
    .map(entry => ({ id: entry.name, dir: join(dir, entry.name) }));
}

/** Load a specific blueprint by ID — checks project-local, then installed, then bundled */
export function loadBlueprint(blueprintId: string): LoadResult {
  // Check project-local
  const projectDir = join(projectBlueprintsDir(), blueprintId);
  if (existsSync(join(projectDir, "blueprint.yml"))) {
    logger.info("Loading project blueprint", { id: blueprintId, dir: projectDir });
    return loadBlueprintFromDir(projectDir);
  }

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
