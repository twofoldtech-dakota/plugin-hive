import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync } from "node:fs";

const HIVE_DIR_NAME = ".plugin-hive";
const DB_NAME = "hive.db";
const LOG_NAME = "hive.log";
const EVENTS_NAME = "events.jsonl";
const DASHBOARD_PID = "observatory.pid";
const DASHBOARD_LOG = "observatory.log";

/** Root data directory: ~/.hive or HIVE_DATA_DIR env override */
export function hiveDataDir(): string {
  const dir = process.env.HIVE_DATA_DIR || join(homedir(), HIVE_DIR_NAME);
  return dir;
}

/** Ensure the data directory exists */
export function ensureDataDir(): string {
  const dir = hiveDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** SQLite database path: ~/.hive/hive.db */
export function dbPath(): string {
  return join(hiveDataDir(), DB_NAME);
}

/** Log file path: ~/.hive/hive.log */
export function logPath(): string {
  return join(hiveDataDir(), LOG_NAME);
}

/** Event log path: ~/.hive/events.jsonl */
export function eventsPath(): string {
  return join(hiveDataDir(), EVENTS_NAME);
}

/** Observatory PID file: ~/.hive/observatory.pid */
export function observatoryPidPath(): string {
  return join(hiveDataDir(), DASHBOARD_PID);
}

/** Observatory log file: ~/.hive/observatory.log */
export function observatoryLogPath(): string {
  return join(hiveDataDir(), DASHBOARD_LOG);
}

/** Installed blueprints directory: ~/.hive/blueprints/ */
export function blueprintsDir(): string {
  return join(hiveDataDir(), "blueprints");
}

/** Specific installed blueprint: ~/.hive/blueprints/<id>/ */
export function blueprintDir(blueprintId: string): string {
  return join(blueprintsDir(), blueprintId);
}

/** Bee chambers root: ~/.hive/chambers/ */
export function chambersDir(): string {
  return join(hiveDataDir(), "chambers");
}

/** Specific bee chamber: ~/.hive/chambers/<blueprintId>/<beeBaseDir>/ */
export function chamberDir(blueprintId: string, beeBaseDir: string): string {
  return join(chambersDir(), blueprintId, beeBaseDir);
}

/** Bundled blueprints directory (relative to plugin root) */
export function bundledBlueprintsDir(): string {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  return join(pluginRoot, "blueprints");
}

/** Project directory from env or cwd */
export function projectDir(): string {
  return process.env.HIVE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/** Project-local blueprints directory: {projectDir}/.hive/blueprints/ */
export function projectBlueprintsDir(): string {
  return join(projectDir(), ".hive", "blueprints");
}

/** Ensure a directory exists, creating it if needed */
export function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}
