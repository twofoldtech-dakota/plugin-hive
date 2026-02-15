#!/usr/bin/env node

// Session stop hook: warn about active swarms and stuck flights
// Uses node:sqlite (DatabaseSync) — no build step or dependencies needed

import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

const dataDir = process.env.HIVE_DATA_DIR || join(homedir(), ".plugin-hive");
const dbFile = join(dataDir, "hive.db");

if (!existsSync(dbFile)) {
  process.exit(0);
}

try {
  const db = new DatabaseSync(dbFile, { open: true });

  const swarms = db
    .prepare(
      `SELECT swarm_number, blueprint_id, task
       FROM swarms WHERE status = 'buzzing'`
    )
    .all();

  const stuckFlights = db
    .prepare(
      `SELECT f.flight_id, f.bee_id, s.swarm_number
       FROM flights f JOIN swarms s ON f.swarm_id = s.id
       WHERE f.status = 'in_flight'
         AND f.updated_at < datetime('now', '-35 minutes')`
    )
    .all();

  db.close();

  const lines = [];

  if (swarms.length > 0) {
    lines.push(
      `Plugin Hive: ${swarms.length} swarm(s) still buzzing — they will pause without a coordinator.`
    );
    for (const s of swarms) {
      const task =
        s.task.length > 50 ? s.task.slice(0, 50) + "..." : s.task;
      lines.push(`  #${s.swarm_number} ${s.blueprint_id} — ${task}`);
    }
  }

  if (stuckFlights.length > 0) {
    lines.push(
      `Warning: ${stuckFlights.length} flight(s) stuck in_flight for >35 min:`
    );
    for (const f of stuckFlights) {
      lines.push(`  Swarm #${f.swarm_number} — ${f.bee_id}/${f.flight_id}`);
    }
    lines.push("Run /hive beekeeper next session to reset stuck flights.");
  }

  if (lines.length > 0) {
    console.log(lines.join("\n"));
  }
} catch {
  // Silently exit on any error
  process.exit(0);
}
