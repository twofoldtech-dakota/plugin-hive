import { createServer } from "node:http";
import { writeFileSync, unlinkSync } from "node:fs";
import { initDb } from "../db.js";
import { observatoryPidPath } from "../lib/paths.js";
import { handleRequest } from "./api.js";

const port = parseInt(process.env.HIVE_OBSERVATORY_PORT ?? "4242", 10);

// Initialize own DB connection (separate process)
initDb();

const httpServer = createServer(handleRequest);

httpServer.listen(port, "127.0.0.1", () => {
  const pidPath = observatoryPidPath();
  writeFileSync(pidPath, `${process.pid}:${port}`);

  // Notify parent via IPC if available
  if (process.send) {
    process.send({ type: "ready", port, pid: process.pid });
  }
});

function cleanup(): void {
  try {
    unlinkSync(observatoryPidPath());
  } catch {
    // Already cleaned up
  }
  httpServer.close();
  process.exit(0);
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
