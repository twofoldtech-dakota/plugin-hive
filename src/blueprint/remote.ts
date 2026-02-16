import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, existsSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { loadBlueprintFromDir } from "./loader.js";
import { blueprintsDir } from "../lib/paths.js";
import * as db from "../db.js";
import { logger } from "../lib/logger.js";

export type RemoteInstallResult =
  | { success: true; message: string; blueprint_id: string }
  | { success: false; error: string };

/**
 * Install a blueprint from a Git repo URL.
 * Performs a shallow clone, validates the blueprint, and copies to blueprints dir.
 */
export function installRemoteBlueprint(
  url: string,
  opts?: { subdirectory?: string },
): RemoteInstallResult {
  const tmpDir = join(tmpdir(), `hive-remote-${randomUUID().slice(0, 8)}`);

  try {
    // Shallow clone
    mkdirSync(tmpDir, { recursive: true });
    try {
      execSync(`git clone --depth 1 "${url}" "${tmpDir}"`, {
        timeout: 30_000,
        stdio: "pipe",
      });
    } catch (err) {
      return { success: false, error: `Git clone failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Determine blueprint directory
    const bpDir = opts?.subdirectory ? join(tmpDir, opts.subdirectory) : tmpDir;

    if (!existsSync(join(bpDir, "blueprint.yml"))) {
      return { success: false, error: "No blueprint.yml found in repository" };
    }

    // Validate
    const loadResult = loadBlueprintFromDir(bpDir);
    if (!loadResult.success) {
      return { success: false, error: `Validation failed: ${loadResult.error}` };
    }

    const spec = loadResult.blueprint;
    const targetDir = join(blueprintsDir(), spec.id);

    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true });
    }

    // Copy to blueprints dir (excluding .git)
    mkdirSync(targetDir, { recursive: true });
    cpSync(bpDir, targetDir, {
      recursive: true,
      filter: (src) => !src.includes(".git"),
    });

    // Install in DB
    db.insertBlueprint(spec.id, spec.name ?? null, spec.version ?? null, JSON.stringify(spec));
    db.insertBlueprintSource(spec.id, "git", url, spec.version);

    logger.info("Remote blueprint installed", { id: spec.id, url });

    return {
      success: true,
      message: `Blueprint "${spec.id}" installed from ${url}`,
      blueprint_id: spec.id,
    };
  } finally {
    // Cleanup temp directory
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
