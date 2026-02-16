import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { projectBlueprintsDir, blueprintsDir } from "../lib/paths.js";

export type ScaffoldResult =
  | { success: true; message: string; dir: string }
  | { success: false; error: string };

const SKELETON_YAML = (id: string) => `id: ${id}
name: "${id}"
version: 1
description: "Custom blueprint: ${id}"

bees:
  - id: worker
    role: coding
    chamber:
      base_dir: worker
      files:
        IDENTITY.md: |
          You are a worker bee for the ${id} blueprint.
        NATURE.md: |
          ## Nature
          Execute implementation tasks.

flights:
  - id: do-work
    bee: worker
    type: single
    input: |
      Implement: {{task}}
    expects: "STATUS: done"
    max_retries: 2
`;

const IDENTITY_MD = (role: string) => `# ${role} Bee

You are a specialized ${role} bee.
`;

const NATURE_MD = (role: string) => `## Nature

You are a ${role} bee. Follow your assigned flight instructions carefully.
`;

/**
 * Scaffold a new blueprint directory with skeleton YAML and bee identity files.
 */
export function scaffoldBlueprint(
  id: string,
  opts?: { location?: "project" | "global" },
): ScaffoldResult {
  // Validate ID
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    return { success: false, error: `Invalid blueprint ID "${id}". Must be lowercase alphanumeric with hyphens.` };
  }

  const location = opts?.location ?? "project";
  const baseDir = location === "project" ? projectBlueprintsDir() : blueprintsDir();
  const dir = join(baseDir, id);

  if (existsSync(dir)) {
    return { success: false, error: `Blueprint directory already exists: ${dir}` };
  }

  // Create directory structure
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "bees", "worker"), { recursive: true });

  // Write blueprint.yml
  writeFileSync(join(dir, "blueprint.yml"), SKELETON_YAML(id));

  // Write bee identity files
  writeFileSync(join(dir, "bees", "worker", "IDENTITY.md"), IDENTITY_MD("worker"));
  writeFileSync(join(dir, "bees", "worker", "NATURE.md"), NATURE_MD("worker"));

  return {
    success: true,
    message: `Blueprint "${id}" scaffolded at ${dir}`,
    dir,
  };
}
