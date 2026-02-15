import { appendFileSync, statSync, renameSync } from "node:fs";
import { logPath, ensureDataDir } from "./paths.js";

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  data?: Record<string, unknown>;
}

function rotateIfNeeded(path: string): void {
  try {
    const stats = statSync(path);
    if (stats.size > MAX_LOG_SIZE) {
      renameSync(path, path + ".old");
    }
  } catch {
    // File doesn't exist yet — nothing to rotate
  }
}

function write(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
  ensureDataDir();
  const path = logPath();
  rotateIfNeeded(path);

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data ? { data } : {}),
  };

  appendFileSync(path, JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => write("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
};
