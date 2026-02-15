#!/usr/bin/env node

// Session start hook: notify user of active swarms
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
      `SELECT swarm_number, blueprint_id, task, created_at
       FROM swarms WHERE status = 'buzzing'
       ORDER BY created_at DESC`
    )
    .all();

  db.close();

  if (swarms.length === 0) {
    process.exit(0);
  }

  const lines = [`Plugin Hive: ${swarms.length} active swarm(s)`];
  for (const s of swarms) {
    const task =
      s.task.length > 50 ? s.task.slice(0, 50) + "..." : s.task;
    lines.push(`  #${s.swarm_number} ${s.blueprint_id} — ${task}`);
  }
  lines.push("Run /hive status for details.");

  console.log(lines.join("\n"));
} catch {
  // Silently exit on any error (corrupt DB, schema mismatch, etc.)
  process.exit(0);
}
