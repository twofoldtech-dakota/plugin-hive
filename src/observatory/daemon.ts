import { fork, type ChildProcess } from "node:child_process";
import { readFileSync, unlinkSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { observatoryPidPath, observatoryLogPath, ensureDataDir } from "../lib/paths.js";
import { logger } from "../lib/logger.js";
import type { ObservatoryStatus } from "../types.js";

/**
 * Start the Observatory HTTP server as a detached child process.
 */
export function startObservatory(port?: number): Promise<ObservatoryStatus> {
  return new Promise((resolve, reject) => {
    const status = getObservatoryStatus();
    if (status.running) {
      resolve(status);
      return;
    }

    ensureDataDir();
    const logFd = openSync(observatoryLogPath(), "a");

    // Resolve server entry point relative to this file's compiled location
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const serverPath = join(thisDir, "server.js");

    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (port) {
      env.HIVE_OBSERVATORY_PORT = String(port);
    }

    const child: ChildProcess = fork(serverPath, [], {
      detached: true,
      stdio: ["ignore", logFd, logFd, "ipc"],
      env,
    });

    const timeout = setTimeout(() => {
      child.removeAllListeners();
      child.kill();
      reject(new Error("Observatory failed to start within 5 seconds"));
    }, 5_000);

    child.on("message", (msg: unknown) => {
      const message = msg as { type: string; port: number; pid: number };
      if (message.type === "ready") {
        clearTimeout(timeout);
        child.unref();
        child.disconnect();
        logger.info("Observatory started", { pid: message.pid, port: message.port });
        resolve({
          running: true,
          pid: message.pid,
          port: message.port,
          url: `http://127.0.0.1:${message.port}`,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Observatory exited with code ${code}`));
      }
    });
  });
}

/**
 * Stop the Observatory HTTP server.
 */
export function stopObservatory(): ObservatoryStatus {
  const pidPath = observatoryPidPath();

  try {
    const content = readFileSync(pidPath, "utf-8").trim();
    const [pidStr] = content.split(":");
    const pid = parseInt(pidStr, 10);

    process.kill(pid, "SIGTERM");
    logger.info("Observatory stopped", { pid });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ESRCH") {
      logger.warn("Observatory stop error", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    unlinkSync(pidPath);
  } catch {
    // Already gone
  }

  return { running: false };
}

/**
 * Get the current Observatory status by reading the PID file and checking if alive.
 */
export function getObservatoryStatus(): ObservatoryStatus {
  const pidPath = observatoryPidPath();

  try {
    const content = readFileSync(pidPath, "utf-8").trim();
    const [pidStr, portStr] = content.split(":");
    const pid = parseInt(pidStr, 10);
    const port = parseInt(portStr, 10);

    // Check if process is alive
    process.kill(pid, 0);

    return {
      running: true,
      pid,
      port,
      url: `http://127.0.0.1:${port}`,
    };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    // Clean up stale PID file
    if (code === "ESRCH") {
      try {
        unlinkSync(pidPath);
      } catch {
        // Already gone
      }
    }
    return { running: false };
  }
}
