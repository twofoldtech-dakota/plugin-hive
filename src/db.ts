import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dbPath, ensureDataDir } from "./lib/paths.js";
import { logger } from "./lib/logger.js";
import type {
  SwarmRecord,
  SwarmStatus,
  FlightRecord,
  FlightStatus,
  CellRecord,
  BlueprintRecord,
  EventRecord,
  BeekeeperCheckRecord,
  HiveEventType,
} from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Cast a sqlite row to a typed record */
function row<T>(val: unknown): T {
  return val as T;
}

/** Cast sqlite rows to typed records */
function rows<T>(val: unknown): T[] {
  return val as T[];
}

// ── Connection Management ────────────────────────────────────────────

let _db: DatabaseSync | null = null;
let _dbCreatedAt = 0;
const CONNECTION_TTL_MS = 5_000;

function getDb(): DatabaseSync {
  const now = Date.now();
  if (_db && now - _dbCreatedAt < CONNECTION_TTL_MS) {
    return _db;
  }
  if (_db) {
    _db.close();
  }
  ensureDataDir();
  _db = new DatabaseSync(dbPath());
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  _dbCreatedAt = now;
  migrate(_db);
  return _db;
}

// ── Schema & Migrations ─────────────────────────────────────────────

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blueprints (
      id TEXT PRIMARY KEY,
      name TEXT,
      version INTEGER,
      spec TEXT NOT NULL,
      installed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS swarms (
      id TEXT PRIMARY KEY,
      swarm_number INTEGER,
      blueprint_id TEXT NOT NULL REFERENCES blueprints(id),
      task TEXT NOT NULL,
      status TEXT DEFAULT 'buzzing',
      nectar TEXT DEFAULT '{}',
      notify_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flights (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL REFERENCES swarms(id),
      flight_id TEXT NOT NULL,
      bee_id TEXT NOT NULL,
      flight_index INTEGER NOT NULL,
      input_template TEXT NOT NULL,
      expects TEXT NOT NULL,
      status TEXT DEFAULT 'waiting',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      type TEXT DEFAULT 'single',
      loop_config TEXT,
      current_cell_id TEXT,
      abandoned_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cells (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL REFERENCES swarms(id),
      cell_index INTEGER,
      cell_id TEXT,
      title TEXT,
      description TEXT,
      acceptance_criteria TEXT,
      status TEXT DEFAULT 'pending',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS beekeeper_checks (
      id TEXT PRIMARY KEY,
      checked_at TEXT DEFAULT (datetime('now')),
      issues_found INTEGER DEFAULT 0,
      actions_taken INTEGER DEFAULT 0,
      summary TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      swarm_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migration: add verify_meta column to flights (idempotent)
  const cols = db.prepare("PRAGMA table_info(flights)").all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === "verify_meta")) {
    db.exec("ALTER TABLE flights ADD COLUMN verify_meta TEXT");
  }
}

// ── Blueprints ───────────────────────────────────────────────────────

export function insertBlueprint(
  id: string,
  name: string | null,
  version: number | null,
  spec: string,
): BlueprintRecord {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO blueprints (id, name, version, spec, installed_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(id, name, version, spec);
  return getBlueprint(id)!;
}

export function getBlueprint(id: string): BlueprintRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM blueprints WHERE id = ?").get(id);
  return result ? row<BlueprintRecord>(result) : undefined;
}

export function listBlueprints(): BlueprintRecord[] {
  const db = getDb();
  return rows<BlueprintRecord>(db.prepare("SELECT * FROM blueprints ORDER BY installed_at DESC").all());
}

export function deleteBlueprint(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM blueprints WHERE id = ?").run(id);
}

// ── Swarms ───────────────────────────────────────────────────────────

export function createSwarm(
  blueprintId: string,
  task: string,
  nectar: Record<string, string> = {},
  notifyUrl?: string,
): SwarmRecord {
  const db = getDb();
  const id = randomUUID();

  // Get next swarm number
  const result = db.prepare("SELECT MAX(swarm_number) as max_num FROM swarms").get();
  const maxNum = result ? (row<{ max_num: number | null }>(result)).max_num : null;
  const swarmNumber = (maxNum ?? 0) + 1;

  db.prepare(
    `INSERT INTO swarms (id, swarm_number, blueprint_id, task, status, nectar, notify_url)
     VALUES (?, ?, ?, ?, 'buzzing', ?, ?)`,
  ).run(id, swarmNumber, blueprintId, task, JSON.stringify(nectar), notifyUrl ?? null);

  return getSwarm(id)!;
}

export function getSwarm(id: string): SwarmRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM swarms WHERE id = ?").get(id);
  return result ? row<SwarmRecord>(result) : undefined;
}

export function getSwarmByNumber(num: number): SwarmRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM swarms WHERE swarm_number = ?").get(num);
  return result ? row<SwarmRecord>(result) : undefined;
}

export function findSwarm(query: string): SwarmRecord | undefined {
  // Try by number
  const num = parseInt(query, 10);
  if (!isNaN(num)) {
    const byNum = getSwarmByNumber(num);
    if (byNum) return byNum;
  }
  // Try by UUID prefix
  const db = getDb();
  const byId = db.prepare("SELECT * FROM swarms WHERE id LIKE ?").get(query + "%");
  if (byId) return row<SwarmRecord>(byId);
  // Try by task substring
  const byTask = db
    .prepare("SELECT * FROM swarms WHERE task LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get("%" + query + "%");
  return byTask ? row<SwarmRecord>(byTask) : undefined;
}

export function listSwarms(filters?: {
  status?: SwarmStatus;
  blueprint_id?: string;
  limit?: number;
}): SwarmRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];

  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.blueprint_id) {
    conditions.push("blueprint_id = ?");
    params.push(filters.blueprint_id);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const limit = filters?.limit ? `LIMIT ${filters.limit}` : "";

  const stmt = db.prepare(`SELECT * FROM swarms ${where} ORDER BY created_at DESC ${limit}`);
  return rows<SwarmRecord>(params.length > 0 ? stmt.all(...params) : stmt.all());
}

export function updateSwarm(
  id: string,
  updates: Partial<Pick<SwarmRecord, "status" | "nectar" | "notify_url">>,
): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: SQLInputValue[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);
  }
  if (updates.nectar !== undefined) {
    sets.push("nectar = ?");
    params.push(updates.nectar);
  }
  if (updates.notify_url !== undefined) {
    sets.push("notify_url = ?");
    params.push(updates.notify_url);
  }

  params.push(id);
  db.prepare(`UPDATE swarms SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

// ── Flights ──────────────────────────────────────────────────────────

export function insertFlight(
  swarmId: string,
  flightId: string,
  beeId: string,
  flightIndex: number,
  inputTemplate: string,
  expects: string,
  status: FlightStatus,
  maxRetries: number,
  type: "single" | "loop" = "single",
  loopConfig?: string,
): FlightRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO flights (id, swarm_id, flight_id, bee_id, flight_index, input_template, expects, status, max_retries, type, loop_config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, swarmId, flightId, beeId, flightIndex, inputTemplate, expects, status, maxRetries, type, loopConfig ?? null);
  return getFlight(id)!;
}

export function getFlight(id: string): FlightRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM flights WHERE id = ?").get(id);
  return result ? row<FlightRecord>(result) : undefined;
}

export function getFlightsForSwarm(swarmId: string): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare("SELECT * FROM flights WHERE swarm_id = ? ORDER BY flight_index ASC").all(swarmId),
  );
}

export function getFlightByFlightId(swarmId: string, flightId: string): FlightRecord | undefined {
  const db = getDb();
  const result = db
    .prepare("SELECT * FROM flights WHERE swarm_id = ? AND flight_id = ?")
    .get(swarmId, flightId);
  return result ? row<FlightRecord>(result) : undefined;
}

export function peekFlightsForBee(beeId: string): number {
  const db = getDb();
  const result = db
    .prepare(
      `SELECT COUNT(*) as count FROM flights f
       JOIN swarms s ON f.swarm_id = s.id
       WHERE f.bee_id = ? AND f.status = 'pending' AND s.status = 'buzzing'`,
    )
    .get(beeId);
  return row<{ count: number }>(result).count;
}

export function claimFlightForBee(beeId: string): FlightRecord | undefined {
  const db = getDb();
  const result = db
    .prepare(
      `SELECT f.* FROM flights f
       JOIN swarms s ON f.swarm_id = s.id
       WHERE f.bee_id = ? AND f.status = 'pending' AND s.status = 'buzzing'
       ORDER BY f.flight_index ASC
       LIMIT 1`,
    )
    .get(beeId);

  if (result) {
    const flight = row<FlightRecord>(result);
    db.prepare(
      "UPDATE flights SET status = 'in_flight', updated_at = datetime('now') WHERE id = ?",
    ).run(flight.id);
    return { ...flight, status: "in_flight" };
  }
  return undefined;
}

export function updateFlight(
  id: string,
  updates: Partial<
    Pick<
      FlightRecord,
      "status" | "output" | "retry_count" | "current_cell_id" | "abandoned_count" | "verify_meta"
    >
  >,
): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: SQLInputValue[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);
  }
  if (updates.output !== undefined) {
    sets.push("output = ?");
    params.push(updates.output);
  }
  if (updates.retry_count !== undefined) {
    sets.push("retry_count = ?");
    params.push(updates.retry_count);
  }
  if (updates.current_cell_id !== undefined) {
    sets.push("current_cell_id = ?");
    params.push(updates.current_cell_id);
  }
  if (updates.abandoned_count !== undefined) {
    sets.push("abandoned_count = ?");
    params.push(updates.abandoned_count);
  }
  if (updates.verify_meta !== undefined) {
    sets.push("verify_meta = ?");
    params.push(updates.verify_meta);
  }

  params.push(id);
  db.prepare(`UPDATE flights SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function insertVerificationFlight(
  swarmId: string,
  flightId: string,
  beeId: string,
  flightIndex: number,
  inputTemplate: string,
  expects: string,
  maxRetries: number,
  verifyMeta: string,
): FlightRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO flights (id, swarm_id, flight_id, bee_id, flight_index, input_template, expects, status, max_retries, type, verify_meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'single', ?)`,
  ).run(id, swarmId, flightId, beeId, flightIndex, inputTemplate, expects, maxRetries, verifyMeta);
  return getFlight(id)!;
}

export function getVerificationFlightsForSwarm(swarmId: string): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare("SELECT * FROM flights WHERE swarm_id = ? AND verify_meta IS NOT NULL ORDER BY flight_index ASC").all(swarmId),
  );
}

// ── Cells ────────────────────────────────────────────────────────────

export function insertCell(
  swarmId: string,
  cellIndex: number,
  cellId: string,
  title: string,
  description: string,
  acceptanceCriteria: string[],
  maxRetries: number = 3,
): CellRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO cells (id, swarm_id, cell_index, cell_id, title, description, acceptance_criteria, max_retries)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, swarmId, cellIndex, cellId, title, description, JSON.stringify(acceptanceCriteria), maxRetries);
  return getCell(id)!;
}

export function getCell(id: string): CellRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM cells WHERE id = ?").get(id);
  return result ? row<CellRecord>(result) : undefined;
}

export function getCellsForSwarm(swarmId: string): CellRecord[] {
  const db = getDb();
  return rows<CellRecord>(
    db.prepare("SELECT * FROM cells WHERE swarm_id = ? ORDER BY cell_index ASC").all(swarmId),
  );
}

export function getNextPendingCell(swarmId: string): CellRecord | undefined {
  const db = getDb();
  const result = db
    .prepare(
      "SELECT * FROM cells WHERE swarm_id = ? AND status = 'pending' ORDER BY cell_index ASC LIMIT 1",
    )
    .get(swarmId);
  return result ? row<CellRecord>(result) : undefined;
}

export function updateCell(
  id: string,
  updates: Partial<Pick<CellRecord, "status" | "output" | "retry_count">>,
): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: SQLInputValue[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);
  }
  if (updates.output !== undefined) {
    sets.push("output = ?");
    params.push(updates.output);
  }
  if (updates.retry_count !== undefined) {
    sets.push("retry_count = ?");
    params.push(updates.retry_count);
  }

  params.push(id);
  db.prepare(`UPDATE cells SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

// ── Events ───────────────────────────────────────────────────────────

export function insertEvent(
  eventType: HiveEventType,
  swarmId?: string,
  payload?: Record<string, unknown>,
): EventRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO events (id, swarm_id, event_type, payload) VALUES (?, ?, ?, ?)",
  ).run(id, swarmId ?? null, eventType, payload ? JSON.stringify(payload) : null);
  return row<EventRecord>(db.prepare("SELECT * FROM events WHERE id = ?").get(id));
}

export function getEventsForSwarm(swarmId: string, limit: number = 50): EventRecord[] {
  const db = getDb();
  return rows<EventRecord>(
    db.prepare("SELECT * FROM events WHERE swarm_id = ? ORDER BY created_at DESC LIMIT ?").all(swarmId, limit),
  );
}

export function getRecentEvents(limit: number = 50): EventRecord[] {
  const db = getDb();
  return rows<EventRecord>(
    db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?").all(limit),
  );
}

// ── Beekeeper ────────────────────────────────────────────────────────

export function insertBeekeeperCheck(
  issuesFound: number,
  actionsTaken: number,
  summary: string,
  details?: Record<string, unknown>,
): BeekeeperCheckRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO beekeeper_checks (id, issues_found, actions_taken, summary, details) VALUES (?, ?, ?, ?, ?)",
  ).run(id, issuesFound, actionsTaken, summary, details ? JSON.stringify(details) : null);
  return row<BeekeeperCheckRecord>(db.prepare("SELECT * FROM beekeeper_checks WHERE id = ?").get(id));
}

export function getRecentBeekeeperChecks(limit: number = 10): BeekeeperCheckRecord[] {
  const db = getDb();
  return rows<BeekeeperCheckRecord>(
    db.prepare("SELECT * FROM beekeeper_checks ORDER BY checked_at DESC LIMIT ?").all(limit),
  );
}

// ── Utility ──────────────────────────────────────────────────────────

export function getStuckFlights(timeoutMinutes: number = 35): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare(
      `SELECT * FROM flights
       WHERE status = 'in_flight'
       AND updated_at < datetime('now', '-' || ? || ' minutes')`,
    ).all(timeoutMinutes),
  );
}

export function getStalledSwarms(minutesSinceUpdate: number = 30): SwarmRecord[] {
  const db = getDb();
  return rows<SwarmRecord>(
    db.prepare(
      `SELECT * FROM swarms
       WHERE status = 'buzzing'
       AND updated_at < datetime('now', '-' || ? || ' minutes')`,
    ).all(minutesSinceUpdate),
  );
}

export function getZombieSwarms(): SwarmRecord[] {
  const db = getDb();
  return rows<SwarmRecord>(
    db.prepare(
      `SELECT s.* FROM swarms s
       WHERE s.status = 'buzzing'
       AND NOT EXISTS (
         SELECT 1 FROM flights f
         WHERE f.swarm_id = s.id
         AND f.verify_meta IS NULL
         AND f.status NOT IN ('done', 'failed')
       )`,
    ).all(),
  );
}

export function getExhaustedFlights(): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare(
      `SELECT f.* FROM flights f
       JOIN swarms s ON f.swarm_id = s.id
       WHERE f.abandoned_count >= 5
       AND f.status != 'failed'
       AND s.status = 'buzzing'`,
    ).all(),
  );
}

/** Close the database connection */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Initialize and return connection (for startup verification) */
export function initDb(): void {
  getDb();
  logger.info("Database initialized", { path: dbPath() });
}
