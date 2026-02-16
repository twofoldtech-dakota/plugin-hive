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
  ChainRecord,
  BlueprintSourceRecord,
  SnapshotRecord,
  FlightTraceRecord,
  NotificationConfigRecord,
  WebhookDeliveryRecord,
  FlightPulseRecord,
  FlightUsageRecord,
  BeeStatsRecord,
  HiveConfigRecord,
  SwarmArchiveRecord,
  MaintenanceResult,
  BlueprintVersionRecord,
  CacheEntry,
  SwarmTemplate,
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

  // Indexes for common query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flights_bee_status ON flights(bee_id, status);
    CREATE INDEX IF NOT EXISTS idx_flights_swarm_id ON flights(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_cells_swarm_status ON cells(swarm_id, status);
    CREATE INDEX IF NOT EXISTS idx_swarms_status ON swarms(status);
    CREATE INDEX IF NOT EXISTS idx_events_swarm_id ON events(swarm_id, created_at);
  `);

  // Migration: add verify_meta column to flights (idempotent)
  const cols = db.prepare("PRAGMA table_info(flights)").all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === "verify_meta")) {
    db.exec("ALTER TABLE flights ADD COLUMN verify_meta TEXT");
  }

  // Migration: add depends_on, started_at, completed_at to flights (Phase 8)
  if (!cols.some(c => c.name === "depends_on")) {
    db.exec("ALTER TABLE flights ADD COLUMN depends_on TEXT");
  }
  if (!cols.some(c => c.name === "started_at")) {
    db.exec("ALTER TABLE flights ADD COLUMN started_at TEXT");
  }
  if (!cols.some(c => c.name === "completed_at")) {
    db.exec("ALTER TABLE flights ADD COLUMN completed_at TEXT");
  }

  // Migration: add started_at, completed_at to cells (Phase 8)
  const cellCols = db.prepare("PRAGMA table_info(cells)").all() as Array<{ name: string }>;
  if (!cellCols.some(c => c.name === "started_at")) {
    db.exec("ALTER TABLE cells ADD COLUMN started_at TEXT");
  }
  if (!cellCols.some(c => c.name === "completed_at")) {
    db.exec("ALTER TABLE cells ADD COLUMN completed_at TEXT");
  }

  // Migration: hive_meta table for epoch-based change detection (Phase 8)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hive_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO hive_meta (key, value) VALUES ('epoch', '0');
  `);

  // Migration: Phase 9 — when_clause, gate, retry_at, retry_strategy on flights
  if (!cols.some(c => c.name === "when_clause")) {
    db.exec("ALTER TABLE flights ADD COLUMN when_clause TEXT");
  }
  if (!cols.some(c => c.name === "gate")) {
    db.exec("ALTER TABLE flights ADD COLUMN gate TEXT");
  }
  if (!cols.some(c => c.name === "retry_at")) {
    db.exec("ALTER TABLE flights ADD COLUMN retry_at TEXT");
  }
  if (!cols.some(c => c.name === "retry_strategy")) {
    db.exec("ALTER TABLE flights ADD COLUMN retry_strategy TEXT");
  }

  // Migration: Phase 10 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS chains (
      id TEXT PRIMARY KEY,
      name TEXT,
      root_swarm_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blueprint_sources (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_uri TEXT,
      pinned_version INTEGER,
      installed_version INTEGER,
      last_checked_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL,
      snapshot_type TEXT DEFAULT 'manual',
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flight_traces (
      id TEXT PRIMARY KEY,
      flight_id TEXT NOT NULL,
      swarm_id TEXT NOT NULL,
      trace_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_config (
      id TEXT PRIMARY KEY DEFAULT 'global',
      default_url TEXT,
      enabled_events TEXT,
      format TEXT DEFAULT 'standard',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      last_attempt_at TEXT,
      last_error TEXT,
      response_status INTEGER,
      next_retry_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Phase 10 indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chains_root_swarm ON chains(root_swarm_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_swarm ON snapshots(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_flight_traces_flight ON flight_traces(flight_id);
    CREATE INDEX IF NOT EXISTS idx_flight_traces_swarm ON flight_traces(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_blueprint_sources_bp ON blueprint_sources(blueprint_id);
  `);

  // Phase 10 — new columns on swarms
  const swarmCols = db.prepare("PRAGMA table_info(swarms)").all() as Array<{ name: string }>;
  if (!swarmCols.some(c => c.name === "chain_id")) {
    db.exec("ALTER TABLE swarms ADD COLUMN chain_id TEXT");
  }
  if (!swarmCols.some(c => c.name === "parent_swarm_id")) {
    db.exec("ALTER TABLE swarms ADD COLUMN parent_swarm_id TEXT");
  }
  if (!swarmCols.some(c => c.name === "trigger_config")) {
    db.exec("ALTER TABLE swarms ADD COLUMN trigger_config TEXT");
  }

  // Phase 10 — new columns on flights
  if (!cols.some(c => c.name === "error_context")) {
    db.exec("ALTER TABLE flights ADD COLUMN error_context TEXT");
  }
  if (!cols.some(c => c.name === "checkpoint_data")) {
    db.exec("ALTER TABLE flights ADD COLUMN checkpoint_data TEXT");
  }

  // Phase 10 — new columns on blueprints
  const bpCols = db.prepare("PRAGMA table_info(blueprints)").all() as Array<{ name: string }>;
  if (!bpCols.some(c => c.name === "source_type")) {
    db.exec("ALTER TABLE blueprints ADD COLUMN source_type TEXT DEFAULT 'bundled'");
  }
  if (!bpCols.some(c => c.name === "source_uri")) {
    db.exec("ALTER TABLE blueprints ADD COLUMN source_uri TEXT");
  }

  // Phase 11 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS flight_pulses (
      id TEXT PRIMARY KEY,
      flight_id TEXT NOT NULL,
      swarm_id TEXT NOT NULL,
      step TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0.0,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flight_usage (
      id TEXT PRIMARY KEY,
      flight_id TEXT NOT NULL,
      swarm_id TEXT NOT NULL,
      bee_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bee_stats (
      bee_id TEXT PRIMARY KEY,
      total_flights INTEGER NOT NULL DEFAULT 0,
      successes INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      avg_duration_seconds REAL NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Phase 11 indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flight_pulses_flight ON flight_pulses(flight_id);
    CREATE INDEX IF NOT EXISTS idx_flight_pulses_swarm ON flight_pulses(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_flight_usage_flight ON flight_usage(flight_id);
    CREATE INDEX IF NOT EXISTS idx_flight_usage_swarm ON flight_usage(swarm_id);
  `);

  // Phase 11 — new columns on swarms
  if (!swarmCols.some(c => c.name === "priority")) {
    db.exec("ALTER TABLE swarms ADD COLUMN priority INTEGER DEFAULT 5");
  }
  if (!swarmCols.some(c => c.name === "schedule_at")) {
    db.exec("ALTER TABLE swarms ADD COLUMN schedule_at TEXT");
  }

  // Phase 12 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS hive_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS swarm_archives (
      id TEXT PRIMARY KEY,
      swarm_number INTEGER,
      blueprint_id TEXT,
      task TEXT,
      original_status TEXT,
      data TEXT NOT NULL,
      archived_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Phase 12 indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_swarm_archives_blueprint ON swarm_archives(blueprint_id);
    CREATE INDEX IF NOT EXISTS idx_swarm_archives_archived ON swarm_archives(archived_at);
  `);

  // Phase 12 — new columns on flights
  if (!cols.some(c => c.name === "produces")) {
    db.exec("ALTER TABLE flights ADD COLUMN produces TEXT");
  }
  if (!cols.some(c => c.name === "requires")) {
    db.exec("ALTER TABLE flights ADD COLUMN requires TEXT");
  }

  // Phase 12 — seed default config
  db.exec(`
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('max_concurrent_swarms', '5');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('max_flights_per_bee', '1');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('retention_days', '30');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('auto_archive', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('default_priority', '5');
  `);

  // Phase 13 — new column on swarms
  const swarmCols13 = db.prepare("PRAGMA table_info(swarms)").all() as Array<{ name: string }>;
  if (!swarmCols13.some(c => c.name === "replayed_from")) {
    db.exec("ALTER TABLE swarms ADD COLUMN replayed_from TEXT");
  }

  // Phase 13 — last_maintenance_at meta key + retention config
  db.exec(`
    INSERT OR IGNORE INTO hive_meta (key, value) VALUES ('last_maintenance_at', '');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('event_retention_days', '30');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('trace_retention_days', '14');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('check_retention_days', '7');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('webhook_retention_days', '14');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('auto_maintain', 'false');
  `);

  // Phase 14 — gated_at column on flights
  if (!cols.some(c => c.name === "gated_at")) {
    db.exec("ALTER TABLE flights ADD COLUMN gated_at TEXT");
  }

  // Phase 14 — blueprint_versions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS blueprint_versions (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      spec TEXT NOT NULL,
      changes_summary TEXT,
      installed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_blueprint_versions_bp ON blueprint_versions(blueprint_id, version_number);
  `);

  // Phase 14 — adaptive_enabled config
  db.exec(`
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('adaptive_enabled', 'false');
  `);

  // Phase 15 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS flight_cache (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      flight_id TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      output TEXT NOT NULL,
      nectar_keys TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      hit_count INTEGER DEFAULT 0,
      UNIQUE(blueprint_id, flight_id, input_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_flight_cache_lookup
      ON flight_cache(blueprint_id, flight_id, input_hash);

    CREATE TABLE IF NOT EXISTS swarm_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      blueprint_id TEXT NOT NULL,
      description TEXT,
      variables TEXT DEFAULT '{}',
      priority INTEGER DEFAULT 5,
      options TEXT DEFAULT '{}',
      usage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Phase 15 — new columns on swarms
  const swarmCols15 = db.prepare("PRAGMA table_info(swarms)").all() as Array<{ name: string }>;
  if (!swarmCols15.some(c => c.name === "token_budget")) {
    db.exec("ALTER TABLE swarms ADD COLUMN token_budget INTEGER DEFAULT 0");
  }
  if (!swarmCols15.some(c => c.name === "budget_action")) {
    db.exec("ALTER TABLE swarms ADD COLUMN budget_action TEXT DEFAULT 'warn'");
  }

  // Phase 15 — new columns on flights
  const flightCols15 = db.prepare("PRAGMA table_info(flights)").all() as Array<{ name: string }>;
  if (!flightCols15.some(c => c.name === "cache_key")) {
    db.exec("ALTER TABLE flights ADD COLUMN cache_key TEXT");
  }
  if (!flightCols15.some(c => c.name === "cached")) {
    db.exec("ALTER TABLE flights ADD COLUMN cached INTEGER DEFAULT 0");
  }

  // Phase 15 — seed config
  db.exec(`
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('default_token_budget', '0');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('default_budget_action', 'warn');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('cache_enabled', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('cache_ttl_hours', '24');
  `);
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
  opts?: { chain_id?: string; parent_swarm_id?: string; trigger_config?: string; priority?: number; schedule_at?: string },
): SwarmRecord {
  const db = getDb();
  const id = randomUUID();

  // Get next swarm number
  const result = db.prepare("SELECT MAX(swarm_number) as max_num FROM swarms").get();
  const maxNum = result ? (row<{ max_num: number | null }>(result)).max_num : null;
  const swarmNumber = (maxNum ?? 0) + 1;

  const priority = opts?.priority ?? 5;
  const scheduleAt = opts?.schedule_at ?? null;
  const status = scheduleAt ? "scheduled" : "buzzing";

  db.prepare(
    `INSERT INTO swarms (id, swarm_number, blueprint_id, task, status, nectar, notify_url, chain_id, parent_swarm_id, trigger_config, priority, schedule_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, swarmNumber, blueprintId, task, status, JSON.stringify(nectar), notifyUrl ?? null,
    opts?.chain_id ?? null, opts?.parent_swarm_id ?? null, opts?.trigger_config ?? null,
    priority, scheduleAt,
  );

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
  dependsOn?: string[],
  whenClause?: string,
  gate?: string,
  retryStrategy?: string,
  produces?: string[],
  requires?: string[],
): FlightRecord {
  const db = getDb();
  const id = randomUUID();
  const dependsOnJson = dependsOn && dependsOn.length > 0 ? JSON.stringify(dependsOn) : null;
  const producesJson = produces && produces.length > 0 ? JSON.stringify(produces) : null;
  const requiresJson = requires && requires.length > 0 ? JSON.stringify(requires) : null;
  db.prepare(
    `INSERT INTO flights (id, swarm_id, flight_id, bee_id, flight_index, input_template, expects, status, max_retries, type, loop_config, depends_on, when_clause, gate, retry_strategy, produces, requires)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, swarmId, flightId, beeId, flightIndex, inputTemplate, expects, status, maxRetries, type, loopConfig ?? null, dependsOnJson, whenClause ?? null, gate ?? null, retryStrategy ?? null, producesJson, requiresJson);
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
       WHERE f.bee_id = ? AND f.status = 'pending' AND s.status = 'buzzing'
       AND (f.retry_at IS NULL OR f.retry_at <= datetime('now'))`,
    )
    .get(beeId);
  return row<{ count: number }>(result).count;
}

export function peekFlightsForBees(beeIds: string[]): Map<string, number> {
  const db = getDb();
  const map = new Map<string, number>();
  for (const id of beeIds) map.set(id, 0);
  if (beeIds.length === 0) return map;

  const placeholders = beeIds.map(() => "?").join(",");
  const results = db
    .prepare(
      `SELECT f.bee_id, COUNT(*) as count FROM flights f
       JOIN swarms s ON f.swarm_id = s.id
       WHERE f.bee_id IN (${placeholders}) AND f.status = 'pending' AND s.status = 'buzzing'
       AND (f.retry_at IS NULL OR f.retry_at <= datetime('now'))
       GROUP BY f.bee_id`,
    )
    .all(...beeIds) as Array<{ bee_id: string; count: number }>;

  for (const r of results) {
    map.set(r.bee_id, r.count);
  }
  return map;
}

export function claimFlightForBee(beeId: string): FlightRecord | undefined {
  const db = getDb();
  const result = db
    .prepare(
      `SELECT f.* FROM flights f
       JOIN swarms s ON f.swarm_id = s.id
       WHERE f.bee_id = ? AND f.status = 'pending' AND s.status = 'buzzing'
       AND (f.retry_at IS NULL OR f.retry_at <= datetime('now'))
       ORDER BY s.priority DESC, f.flight_index ASC
       LIMIT 1`,
    )
    .get(beeId);

  if (result) {
    const flight = row<FlightRecord>(result);
    db.prepare(
      "UPDATE flights SET status = 'in_flight', started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
    ).run(flight.id);
    return { ...flight, status: "in_flight", started_at: flight.started_at ?? new Date().toISOString().replace("T", " ").slice(0, 19) };
  }
  return undefined;
}

export function updateFlight(
  id: string,
  updates: Partial<
    Pick<
      FlightRecord,
      "status" | "output" | "retry_count" | "current_cell_id" | "abandoned_count" | "verify_meta" | "started_at" | "completed_at" | "retry_at" | "error_context" | "checkpoint_data" | "gated_at"
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
  if (updates.started_at !== undefined) {
    sets.push("started_at = ?");
    params.push(updates.started_at);
  }
  if (updates.completed_at !== undefined) {
    sets.push("completed_at = ?");
    params.push(updates.completed_at);
  }
  if (updates.retry_at !== undefined) {
    sets.push("retry_at = ?");
    params.push(updates.retry_at);
  }
  if (updates.error_context !== undefined) {
    sets.push("error_context = ?");
    params.push(updates.error_context);
  }
  if (updates.checkpoint_data !== undefined) {
    sets.push("checkpoint_data = ?");
    params.push(updates.checkpoint_data);
  }
  if (updates.gated_at !== undefined) {
    sets.push("gated_at = ?");
    params.push(updates.gated_at);
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
  updates: Partial<Pick<CellRecord, "status" | "output" | "retry_count" | "started_at" | "completed_at">>,
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
  if (updates.started_at !== undefined) {
    sets.push("started_at = ?");
    params.push(updates.started_at);
  }
  if (updates.completed_at !== undefined) {
    sets.push("completed_at = ?");
    params.push(updates.completed_at);
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
       AND COALESCE(started_at, updated_at) < datetime('now', '-' || ? || ' minutes')`,
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

// ── Epoch (change detection) ────────────────────────────────────────

export function bumpEpoch(): number {
  const db = getDb();
  db.prepare("UPDATE hive_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'epoch'").run();
  const result = db.prepare("SELECT value FROM hive_meta WHERE key = 'epoch'").get() as { value: string } | undefined;
  return result ? parseInt(result.value, 10) : 0;
}

export function getEpoch(): number {
  const db = getDb();
  const result = db.prepare("SELECT value FROM hive_meta WHERE key = 'epoch'").get() as { value: string } | undefined;
  return result ? parseInt(result.value, 10) : 0;
}

// ── Duration Queries ────────────────────────────────────────────────

export function getFlightDurations(swarmId: string): Array<{ flight_id: string; status: string; duration_seconds: number | null }> {
  const db = getDb();
  return db.prepare(
    `SELECT flight_id, status,
       CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
         THEN ROUND((julianday(completed_at) - julianday(started_at)) * 86400)
         ELSE NULL END as duration_seconds
     FROM flights WHERE swarm_id = ? AND verify_meta IS NULL ORDER BY flight_index ASC`,
  ).all(swarmId) as Array<{ flight_id: string; status: string; duration_seconds: number | null }>;
}

export function getCellDurations(swarmId: string): Array<{ cell_id: string; status: string; duration_seconds: number | null }> {
  const db = getDb();
  return db.prepare(
    `SELECT cell_id, status,
       CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
         THEN ROUND((julianday(completed_at) - julianday(started_at)) * 86400)
         ELSE NULL END as duration_seconds
     FROM cells WHERE swarm_id = ? ORDER BY cell_index ASC`,
  ).all(swarmId) as Array<{ cell_id: string; status: string; duration_seconds: number | null }>;
}

export function getFlightElapsed(flightUuid: string): number | null {
  const db = getDb();
  const result = db.prepare(
    `SELECT CASE
       WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
         THEN ROUND((julianday(completed_at) - julianday(started_at)) * 86400)
       WHEN started_at IS NOT NULL
         THEN ROUND((julianday(datetime('now')) - julianday(started_at)) * 86400)
       ELSE NULL END as elapsed
     FROM flights WHERE id = ?`,
  ).get(flightUuid) as { elapsed: number | null } | undefined;
  return result?.elapsed ?? null;
}

// ── Phase 9 Queries ─────────────────────────────────────────────────

export function getGatedFlightsForSwarm(swarmId: string): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare("SELECT * FROM flights WHERE swarm_id = ? AND status = 'gated' ORDER BY flight_index ASC").all(swarmId),
  );
}

export function getVerificationLoopCells(swarmId: string, maxRetries: number = 3): CellRecord[] {
  const db = getDb();
  return rows<CellRecord>(
    db.prepare(
      `SELECT * FROM cells WHERE swarm_id = ? AND status = 'pending' AND retry_count >= ?`,
    ).all(swarmId, maxRetries),
  );
}

export function getStuckCells(swarmId: string, minutes: number = 30): CellRecord[] {
  const db = getDb();
  return rows<CellRecord>(
    db.prepare(
      `SELECT * FROM cells WHERE swarm_id = ? AND status = 'in_progress'
       AND started_at IS NOT NULL
       AND started_at < datetime('now', '-' || ? || ' minutes')`,
    ).all(swarmId, minutes),
  );
}

// ── Chains ──────────────────────────────────────────────────────────

export function insertChain(
  rootSwarmId: string,
  name?: string,
): ChainRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO chains (id, name, root_swarm_id) VALUES (?, ?, ?)",
  ).run(id, name ?? null, rootSwarmId);
  return getChain(id)!;
}

export function getChain(id: string): ChainRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM chains WHERE id = ?").get(id);
  return result ? row<ChainRecord>(result) : undefined;
}

export function getChainByRootSwarm(swarmId: string): ChainRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM chains WHERE root_swarm_id = ?").get(swarmId);
  return result ? row<ChainRecord>(result) : undefined;
}

export function listChains(filters?: { status?: string }): ChainRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const stmt = db.prepare(`SELECT * FROM chains ${where} ORDER BY created_at DESC`);
  return rows<ChainRecord>(params.length > 0 ? stmt.all(...params) : stmt.all());
}

export function updateChain(
  id: string,
  updates: Partial<Pick<ChainRecord, "status" | "name">>,
): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: SQLInputValue[] = [];
  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);
  }
  if (updates.name !== undefined) {
    sets.push("name = ?");
    params.push(updates.name);
  }
  params.push(id);
  db.prepare(`UPDATE chains SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function getSwarmsForChain(chainId: string): SwarmRecord[] {
  const db = getDb();
  return rows<SwarmRecord>(
    db.prepare("SELECT * FROM swarms WHERE chain_id = ? ORDER BY created_at ASC").all(chainId),
  );
}

// ── Blueprint Sources ───────────────────────────────────────────────

export function insertBlueprintSource(
  blueprintId: string,
  sourceType: string,
  sourceUri?: string,
  installedVersion?: number,
): BlueprintSourceRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO blueprint_sources (id, blueprint_id, source_type, source_uri, installed_version) VALUES (?, ?, ?, ?, ?)",
  ).run(id, blueprintId, sourceType, sourceUri ?? null, installedVersion ?? null);
  return row<BlueprintSourceRecord>(db.prepare("SELECT * FROM blueprint_sources WHERE id = ?").get(id));
}

export function getBlueprintSource(blueprintId: string): BlueprintSourceRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM blueprint_sources WHERE blueprint_id = ? ORDER BY created_at DESC LIMIT 1").get(blueprintId);
  return result ? row<BlueprintSourceRecord>(result) : undefined;
}

// ── Snapshots ───────────────────────────────────────────────────────

export function insertSnapshot(
  swarmId: string,
  data: string,
  snapshotType: "manual" | "checkpoint" | "auto" = "manual",
): SnapshotRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO snapshots (id, swarm_id, snapshot_type, data) VALUES (?, ?, ?, ?)",
  ).run(id, swarmId, snapshotType, data);
  return row<SnapshotRecord>(db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id));
}

export function getSnapshot(id: string): SnapshotRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id);
  return result ? row<SnapshotRecord>(result) : undefined;
}

export function getSnapshotsForSwarm(swarmId: string): SnapshotRecord[] {
  const db = getDb();
  return rows<SnapshotRecord>(
    db.prepare("SELECT * FROM snapshots WHERE swarm_id = ? ORDER BY created_at DESC").all(swarmId),
  );
}

// ── Flight Traces ───────────────────────────────────────────────────

export function insertFlightTrace(
  flightId: string,
  swarmId: string,
  traceType: "claimed" | "output" | "error" | "retry",
  data: Record<string, unknown>,
): FlightTraceRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO flight_traces (id, flight_id, swarm_id, trace_type, data) VALUES (?, ?, ?, ?, ?)",
  ).run(id, flightId, swarmId, traceType, JSON.stringify(data));
  return row<FlightTraceRecord>(db.prepare("SELECT * FROM flight_traces WHERE id = ?").get(id));
}

export function getTracesForFlight(flightId: string): FlightTraceRecord[] {
  const db = getDb();
  return rows<FlightTraceRecord>(
    db.prepare("SELECT * FROM flight_traces WHERE flight_id = ? ORDER BY created_at ASC").all(flightId),
  );
}

export function getTracesForSwarm(swarmId: string): FlightTraceRecord[] {
  const db = getDb();
  return rows<FlightTraceRecord>(
    db.prepare("SELECT * FROM flight_traces WHERE swarm_id = ? ORDER BY created_at ASC").all(swarmId),
  );
}

// ── Notification Config ─────────────────────────────────────────────

export function getNotificationConfig(): NotificationConfigRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM notification_config WHERE id = 'global'").get();
  return result ? row<NotificationConfigRecord>(result) : undefined;
}

export function upsertNotificationConfig(
  updates: Partial<Pick<NotificationConfigRecord, "default_url" | "enabled_events" | "format">>,
): NotificationConfigRecord {
  const db = getDb();
  const existing = getNotificationConfig();
  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: SQLInputValue[] = [];
    if (updates.default_url !== undefined) {
      sets.push("default_url = ?");
      params.push(updates.default_url);
    }
    if (updates.enabled_events !== undefined) {
      sets.push("enabled_events = ?");
      params.push(updates.enabled_events);
    }
    if (updates.format !== undefined) {
      sets.push("format = ?");
      params.push(updates.format);
    }
    params.push("global");
    db.prepare(`UPDATE notification_config SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  } else {
    db.prepare(
      "INSERT INTO notification_config (id, default_url, enabled_events, format) VALUES ('global', ?, ?, ?)",
    ).run(updates.default_url ?? null, updates.enabled_events ?? null, updates.format ?? "standard");
  }
  return getNotificationConfig()!;
}

// ── Webhook Deliveries ──────────────────────────────────────────────

export function insertWebhookDelivery(
  eventId: string,
  url: string,
  maxAttempts: number = 3,
): WebhookDeliveryRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO webhook_deliveries (id, event_id, url, max_attempts) VALUES (?, ?, ?, ?)",
  ).run(id, eventId, url, maxAttempts);
  return row<WebhookDeliveryRecord>(db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").get(id));
}

export function getWebhookDelivery(id: string): WebhookDeliveryRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").get(id);
  return result ? row<WebhookDeliveryRecord>(result) : undefined;
}

export function updateWebhookDelivery(
  id: string,
  updates: Partial<Pick<WebhookDeliveryRecord, "status" | "attempts" | "last_attempt_at" | "last_error" | "response_status" | "next_retry_at">>,
): void {
  const db = getDb();
  const sets: string[] = [];
  const params: SQLInputValue[] = [];
  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);
  }
  if (updates.attempts !== undefined) {
    sets.push("attempts = ?");
    params.push(updates.attempts);
  }
  if (updates.last_attempt_at !== undefined) {
    sets.push("last_attempt_at = ?");
    params.push(updates.last_attempt_at);
  }
  if (updates.last_error !== undefined) {
    sets.push("last_error = ?");
    params.push(updates.last_error);
  }
  if (updates.response_status !== undefined) {
    sets.push("response_status = ?");
    params.push(updates.response_status);
  }
  if (updates.next_retry_at !== undefined) {
    sets.push("next_retry_at = ?");
    params.push(updates.next_retry_at);
  }
  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE webhook_deliveries SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function listWebhookDeliveries(filters?: { status?: string; limit?: number }): WebhookDeliveryRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const limit = filters?.limit ? `LIMIT ${filters.limit}` : "LIMIT 50";
  const stmt = db.prepare(`SELECT * FROM webhook_deliveries ${where} ORDER BY created_at DESC ${limit}`);
  return rows<WebhookDeliveryRecord>(params.length > 0 ? stmt.all(...params) : stmt.all());
}

export function getFailedWebhookDeliveries(): WebhookDeliveryRecord[] {
  const db = getDb();
  return rows<WebhookDeliveryRecord>(
    db.prepare(
      `SELECT * FROM webhook_deliveries
       WHERE status = 'failed'
       AND attempts < max_attempts
       AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
       ORDER BY created_at ASC`,
    ).all(),
  );
}

// ── Flight Pulses (Phase 11) ────────────────────────────────────────

export function insertPulse(
  flightId: string,
  swarmId: string,
  step: string,
  progress: number,
  message?: string,
): FlightPulseRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO flight_pulses (id, flight_id, swarm_id, step, progress, message) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, flightId, swarmId, step, progress, message ?? null);

  // Ring buffer: keep only last 20 per flight
  db.prepare(
    `DELETE FROM flight_pulses WHERE id NOT IN (
       SELECT id FROM flight_pulses WHERE flight_id = ? ORDER BY created_at DESC LIMIT 20
     ) AND flight_id = ?`,
  ).run(flightId, flightId);

  return row<FlightPulseRecord>(db.prepare("SELECT * FROM flight_pulses WHERE id = ?").get(id));
}

export function getPulsesForFlight(flightId: string): FlightPulseRecord[] {
  const db = getDb();
  return rows<FlightPulseRecord>(
    db.prepare("SELECT * FROM flight_pulses WHERE flight_id = ? ORDER BY created_at DESC LIMIT 20").all(flightId),
  );
}

export function getPulsesForSwarm(swarmId: string): FlightPulseRecord[] {
  const db = getDb();
  return rows<FlightPulseRecord>(
    db.prepare("SELECT * FROM flight_pulses WHERE swarm_id = ? ORDER BY created_at DESC LIMIT 50").all(swarmId),
  );
}

export function getLatestPulseForFlight(flightId: string): FlightPulseRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM flight_pulses WHERE flight_id = ? ORDER BY created_at DESC LIMIT 1").get(flightId);
  return result ? row<FlightPulseRecord>(result) : undefined;
}

export function deletePulsesForFlight(flightId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM flight_pulses WHERE flight_id = ?").run(flightId);
}

// ── Flight Usage (Phase 11) ─────────────────────────────────────────

export function insertUsage(
  flightId: string,
  swarmId: string,
  beeId: string,
  inputTokens: number,
  outputTokens: number,
  estimated: boolean = false,
): FlightUsageRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO flight_usage (id, flight_id, swarm_id, bee_id, input_tokens, output_tokens, estimated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, flightId, swarmId, beeId, inputTokens, outputTokens, estimated ? 1 : 0);
  return row<FlightUsageRecord>(db.prepare("SELECT * FROM flight_usage WHERE id = ?").get(id));
}

export function getUsageForSwarm(swarmId: string): FlightUsageRecord[] {
  const db = getDb();
  return rows<FlightUsageRecord>(
    db.prepare("SELECT * FROM flight_usage WHERE swarm_id = ? ORDER BY created_at ASC").all(swarmId),
  );
}

export function getUsageForFlight(flightId: string): FlightUsageRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM flight_usage WHERE flight_id = ? ORDER BY created_at DESC LIMIT 1").get(flightId);
  return result ? row<FlightUsageRecord>(result) : undefined;
}

// ── Bee Stats (Phase 11) ────────────────────────────────────────────

export function upsertBeeStats(
  beeId: string,
  success: boolean,
  durationSeconds: number,
  tokens: number,
): BeeStatsRecord {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM bee_stats WHERE bee_id = ?").get(beeId);
  if (existing) {
    const stats = row<BeeStatsRecord>(existing);
    const newTotal = stats.total_flights + 1;
    const newSuccesses = stats.successes + (success ? 1 : 0);
    const newFailures = stats.failures + (success ? 0 : 1);
    const newAvgDuration = ((stats.avg_duration_seconds * stats.total_flights) + durationSeconds) / newTotal;
    const newTotalTokens = stats.total_tokens + tokens;
    const newSuccessRate = newTotal > 0 ? newSuccesses / newTotal : 0;
    db.prepare(
      `UPDATE bee_stats SET total_flights = ?, successes = ?, failures = ?, avg_duration_seconds = ?,
       total_tokens = ?, success_rate = ?, updated_at = datetime('now') WHERE bee_id = ?`,
    ).run(newTotal, newSuccesses, newFailures, Math.round(newAvgDuration * 100) / 100, newTotalTokens, Math.round(newSuccessRate * 1000) / 1000, beeId);
  } else {
    db.prepare(
      `INSERT INTO bee_stats (bee_id, total_flights, successes, failures, avg_duration_seconds, total_tokens, success_rate)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
    ).run(beeId, success ? 1 : 0, success ? 0 : 1, Math.round(durationSeconds * 100) / 100, tokens, success ? 1.0 : 0.0);
  }
  return getBeeStats(beeId)!;
}

export function getBeeStats(beeId: string): BeeStatsRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM bee_stats WHERE bee_id = ?").get(beeId);
  return result ? row<BeeStatsRecord>(result) : undefined;
}

export function getAllBeeStats(): BeeStatsRecord[] {
  const db = getDb();
  return rows<BeeStatsRecord>(
    db.prepare("SELECT * FROM bee_stats ORDER BY total_flights DESC").all(),
  );
}

export function getBeeStatsForBlueprint(blueprintId: string): BeeStatsRecord[] {
  const db = getDb();
  return rows<BeeStatsRecord>(
    db.prepare("SELECT * FROM bee_stats WHERE bee_id LIKE ? ORDER BY total_flights DESC").all(blueprintId + "_%"),
  );
}

export function getLowPerformanceBees(minFlights: number = 5, maxSuccessRate: number = 0.5): BeeStatsRecord[] {
  const db = getDb();
  return rows<BeeStatsRecord>(
    db.prepare(
      "SELECT * FROM bee_stats WHERE total_flights >= ? AND success_rate < ? ORDER BY success_rate ASC",
    ).all(minFlights, maxSuccessRate),
  );
}

// ── Scheduled Swarms (Phase 11) ─────────────────────────────────────

export function getScheduledSwarms(): SwarmRecord[] {
  const db = getDb();
  return rows<SwarmRecord>(
    db.prepare(
      `SELECT * FROM swarms WHERE status = 'scheduled' AND datetime(replace(schedule_at, 'T', ' ')) <= datetime('now')`,
    ).all(),
  );
}

// ── Phase 12: Hive Config ────────────────────────────────────────────

export function getHiveConfig(key: string): HiveConfigRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM hive_config WHERE key = ?").get(key);
  return result ? row<HiveConfigRecord>(result) : undefined;
}

export function getAllHiveConfig(): HiveConfigRecord[] {
  const db = getDb();
  return rows<HiveConfigRecord>(db.prepare("SELECT * FROM hive_config ORDER BY key ASC").all());
}

export function setHiveConfig(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO hive_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`,
  ).run(key, value, value);
}

// ── Phase 12: Swarm Archives ────────────────────────────────────────

export function insertSwarmArchive(
  swarmNumber: number,
  blueprintId: string,
  task: string,
  originalStatus: string,
  data: string,
): SwarmArchiveRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO swarm_archives (id, swarm_number, blueprint_id, task, original_status, data) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, swarmNumber, blueprintId, task, originalStatus, data);
  return row<SwarmArchiveRecord>(db.prepare("SELECT * FROM swarm_archives WHERE id = ?").get(id));
}

export function getSwarmArchive(id: string): SwarmArchiveRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM swarm_archives WHERE id = ?").get(id);
  return result ? row<SwarmArchiveRecord>(result) : undefined;
}

export function listSwarmArchives(limit: number = 20): SwarmArchiveRecord[] {
  const db = getDb();
  return rows<SwarmArchiveRecord>(
    db.prepare("SELECT * FROM swarm_archives ORDER BY archived_at DESC LIMIT ?").all(limit),
  );
}

// ── Phase 12: Data Lifecycle ────────────────────────────────────────

export function deleteSwarmData(swarmId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM flight_pulses WHERE swarm_id = ?").run(swarmId);
  db.prepare("DELETE FROM flight_usage WHERE swarm_id = ?").run(swarmId);
  db.prepare("DELETE FROM flight_traces WHERE swarm_id = ?").run(swarmId);
  db.prepare("DELETE FROM snapshots WHERE swarm_id = ?").run(swarmId);
  db.prepare("DELETE FROM events WHERE swarm_id = ?").run(swarmId);
  db.prepare("DELETE FROM cells WHERE swarm_id = ?").run(swarmId);
  db.prepare("DELETE FROM flights WHERE swarm_id = ?").run(swarmId);
  db.prepare("DELETE FROM swarms WHERE id = ?").run(swarmId);
}

export function countBuzzingSwarms(blueprintId?: string): number {
  const db = getDb();
  if (blueprintId) {
    const result = db.prepare("SELECT COUNT(*) as count FROM swarms WHERE status = 'buzzing' AND blueprint_id = ?").get(blueprintId);
    return row<{ count: number }>(result).count;
  }
  const result = db.prepare("SELECT COUNT(*) as count FROM swarms WHERE status = 'buzzing'").get();
  return row<{ count: number }>(result).count;
}

export function countInFlightForBee(beeId: string): number {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM flights WHERE bee_id = ? AND status = 'in_flight'").get(beeId);
  return row<{ count: number }>(result).count;
}

export function getQueuedSwarms(): SwarmRecord[] {
  const db = getDb();
  return rows<SwarmRecord>(
    db.prepare("SELECT * FROM swarms WHERE status = 'queued' ORDER BY priority DESC, created_at ASC").all(),
  );
}

export function getOldCompletedSwarms(retentionDays: number): SwarmRecord[] {
  const db = getDb();
  return rows<SwarmRecord>(
    db.prepare(
      `SELECT * FROM swarms WHERE status IN ('completed', 'failed', 'cancelled')
       AND updated_at < datetime('now', '-' || ? || ' days')`,
    ).all(retentionDays),
  );
}

export function getTableCounts(): Record<string, number> {
  const db = getDb();
  const tables = ["swarms", "flights", "cells", "events", "flight_traces", "snapshots", "flight_pulses", "flight_usage", "swarm_archives"];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
    counts[table] = row<{ count: number }>(result).count;
  }
  return counts;
}

export function getOldestEntry(table: string, dateColumn: string): string | null {
  const allowedTables = ["swarms", "flights", "cells", "events", "flight_traces", "snapshots", "swarm_archives"];
  if (!allowedTables.includes(table)) return null;
  const db = getDb();
  const result = db.prepare(`SELECT MIN(${dateColumn}) as oldest FROM ${table}`).get();
  return row<{ oldest: string | null }>(result).oldest;
}

// ── Phase 13: Fleet Metric Queries ──────────────────────────────────

export function getSwarmCountsByStatus(from?: string, to?: string): Record<string, number> {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (from) {
    conditions.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("created_at <= ?");
    params.push(to);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const results = db.prepare(`SELECT status, COUNT(*) as count FROM swarms ${where} GROUP BY status`).all(...params) as Array<{ status: string; count: number }>;
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.status] = r.count;
  return counts;
}

export function getDailySwarmCounts(from: string, to: string): Array<{ date: string; started: number; completed: number; failed: number }> {
  const db = getDb();
  const results = db.prepare(
    `SELECT DATE(created_at) as date,
       COUNT(*) as started,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM swarms
     WHERE created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
  ).all(from, to) as Array<{ date: string; started: number; completed: number; failed: number }>;
  return results;
}

export function getPerBlueprintStats(from?: string, to?: string): Array<{ blueprint_id: string; swarms: number; completed: number; failed: number; avg_duration_seconds: number | null }> {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (from) {
    conditions.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("created_at <= ?");
    params.push(to);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  return db.prepare(
    `SELECT blueprint_id,
       COUNT(*) as swarms,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
       AVG(CASE WHEN status IN ('completed', 'failed') THEN ROUND((julianday(updated_at) - julianday(created_at)) * 86400) ELSE NULL END) as avg_duration_seconds
     FROM swarms ${where}
     GROUP BY blueprint_id
     ORDER BY swarms DESC`,
  ).all(...params) as Array<{ blueprint_id: string; swarms: number; completed: number; failed: number; avg_duration_seconds: number | null }>;
}

export function getSwarmOrArchive(id: string): { source: "swarm"; data: SwarmRecord } | { source: "archive"; data: SwarmArchiveRecord } | undefined {
  const swarm = getSwarm(id);
  if (swarm) return { source: "swarm", data: swarm };
  const archive = getSwarmArchive(id);
  if (archive) return { source: "archive", data: archive };
  // Try by number
  const num = parseInt(id, 10);
  if (!isNaN(num)) {
    const byNum = getSwarmByNumber(num);
    if (byNum) return { source: "swarm", data: byNum };
    // Check archives by swarm_number
    const db = getDb();
    const archiveResult = db.prepare("SELECT * FROM swarm_archives WHERE swarm_number = ?").get(num);
    if (archiveResult) return { source: "archive", data: row<SwarmArchiveRecord>(archiveResult) };
  }
  return undefined;
}

// ── Phase 13: Maintenance Queries ───────────────────────────────────

const ACTIVE_STATUSES = "('buzzing', 'paused', 'blocked', 'queued', 'scheduled')";

export function deleteOldEvents(days: number): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM events WHERE created_at < datetime('now', '-' || ? || ' days')
     AND (swarm_id IS NULL OR swarm_id NOT IN (SELECT id FROM swarms WHERE status IN ${ACTIVE_STATUSES}))`,
  ).run(days);
  return Number(result.changes);
}

export function deleteOldTraces(days: number): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM flight_traces WHERE created_at < datetime('now', '-' || ? || ' days')
     AND swarm_id NOT IN (SELECT id FROM swarms WHERE status IN ${ACTIVE_STATUSES})`,
  ).run(days);
  return Number(result.changes);
}

export function deleteOldChecks(days: number): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM beekeeper_checks WHERE checked_at < datetime('now', '-' || ? || ' days')`,
  ).run(days);
  return Number(result.changes);
}

export function deleteOldWebhooks(days: number): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM webhook_deliveries WHERE created_at < datetime('now', '-' || ? || ' days')
     AND status != 'pending'`,
  ).run(days);
  return Number(result.changes);
}

export function deleteOrphanedPulses(): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM flight_pulses WHERE swarm_id NOT IN (SELECT id FROM swarms WHERE status IN ${ACTIVE_STATUSES})
     AND swarm_id NOT IN (SELECT id FROM swarms)`,
  ).run();
  return Number(result.changes);
}

// ── Phase 13: Meta Helpers ──────────────────────────────────────────

export function getMetaValue(key: string): string | undefined {
  const db = getDb();
  const result = db.prepare("SELECT value FROM hive_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return result?.value;
}

export function setSwarmReplayedFrom(swarmId: string, replayedFrom: string): void {
  const db = getDb();
  db.prepare("UPDATE swarms SET replayed_from = ?, updated_at = datetime('now') WHERE id = ?").run(replayedFrom, swarmId);
}

export function setMetaValue(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO hive_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?`,
  ).run(key, value, value);
}

// ── Phase 14: Estimation Queries ────────────────────────────────────

export function getHistoricalCellCounts(blueprintId: string): number[] {
  const db = getDb();
  const results = db.prepare(
    `SELECT COUNT(*) as cnt FROM cells c
     JOIN swarms s ON c.swarm_id = s.id
     WHERE s.blueprint_id = ? AND s.status IN ('completed', 'failed')
     GROUP BY c.swarm_id`,
  ).all(blueprintId) as Array<{ cnt: number }>;
  return results.map(r => r.cnt);
}

export function getCompletedSwarmCount(blueprintId: string): number {
  const db = getDb();
  const result = db.prepare(
    "SELECT COUNT(*) as count FROM swarms WHERE blueprint_id = ? AND status IN ('completed', 'failed', 'cancelled')",
  ).get(blueprintId);
  return row<{ count: number }>(result).count;
}

export function getAvgSwarmDuration(blueprintId: string): number | null {
  const db = getDb();
  const result = db.prepare(
    `SELECT AVG(ROUND((julianday(updated_at) - julianday(created_at)) * 86400)) as avg_dur
     FROM swarms WHERE blueprint_id = ? AND status IN ('completed', 'failed')`,
  ).get(blueprintId);
  const val = row<{ avg_dur: number | null }>(result).avg_dur;
  return val !== null ? Math.round(val) : null;
}

// ── Phase 14: Gate Policy Queries ───────────────────────────────────

export function getGatedFlightsAll(): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare("SELECT * FROM flights WHERE status = 'gated' ORDER BY updated_at ASC").all(),
  );
}

export function getExpiredGatedFlights(timeoutMinutes: number): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare(
      `SELECT * FROM flights WHERE status = 'gated' AND gated_at IS NOT NULL
       AND gated_at < datetime('now', '-' || ? || ' minutes')`,
    ).all(timeoutMinutes),
  );
}

// ── Phase 14: Blueprint Version Queries ─────────────────────────────

export function insertBlueprintVersion(
  blueprintId: string,
  versionNumber: number,
  spec: string,
  changesSummary?: string,
): BlueprintVersionRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO blueprint_versions (id, blueprint_id, version_number, spec, changes_summary) VALUES (?, ?, ?, ?, ?)",
  ).run(id, blueprintId, versionNumber, spec, changesSummary ?? null);
  return row<BlueprintVersionRecord>(db.prepare("SELECT * FROM blueprint_versions WHERE id = ?").get(id));
}

export function getBlueprintVersions(blueprintId: string): BlueprintVersionRecord[] {
  const db = getDb();
  return rows<BlueprintVersionRecord>(
    db.prepare("SELECT * FROM blueprint_versions WHERE blueprint_id = ? ORDER BY version_number ASC").all(blueprintId),
  );
}

export function getBlueprintVersion(blueprintId: string, versionNumber: number): BlueprintVersionRecord | undefined {
  const db = getDb();
  const result = db.prepare(
    "SELECT * FROM blueprint_versions WHERE blueprint_id = ? AND version_number = ?",
  ).get(blueprintId, versionNumber);
  return result ? row<BlueprintVersionRecord>(result) : undefined;
}

export function getLatestBlueprintVersionNumber(blueprintId: string): number {
  const db = getDb();
  const result = db.prepare(
    "SELECT MAX(version_number) as max_ver FROM blueprint_versions WHERE blueprint_id = ?",
  ).get(blueprintId);
  const val = row<{ max_ver: number | null }>(result).max_ver;
  return val ?? 0;
}

// ── Phase 15: Budget Queries ─────────────────────────────────────────

export function setSwarmBudget(swarmId: string, tokenBudget: number, budgetAction: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE swarms SET token_budget = ?, budget_action = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(tokenBudget, budgetAction, swarmId);
}

export function getSwarmTokenUsage(swarmId: string): number {
  const db = getDb();
  const result = db.prepare(
    "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM flight_usage WHERE swarm_id = ?",
  ).get(swarmId);
  return row<{ total: number }>(result).total;
}

// ── Phase 15: Cache Queries ─────────────────────────────────────────

export function getCachedResult(blueprintId: string, flightId: string, inputHash: string): CacheEntry | undefined {
  const db = getDb();
  const result = db.prepare(
    "SELECT * FROM flight_cache WHERE blueprint_id = ? AND flight_id = ? AND input_hash = ? AND expires_at > datetime('now')",
  ).get(blueprintId, flightId, inputHash);
  if (result) {
    db.prepare("UPDATE flight_cache SET hit_count = hit_count + 1 WHERE id = ?").run(row<CacheEntry>(result).id);
    return row<CacheEntry>(result);
  }
  return undefined;
}

export function insertCacheEntry(
  blueprintId: string,
  flightId: string,
  inputHash: string,
  output: string,
  nectarKeys: string[] | null,
  expiresAt: string,
): CacheEntry {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT OR REPLACE INTO flight_cache (id, blueprint_id, flight_id, input_hash, output, nectar_keys, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, blueprintId, flightId, inputHash, output, nectarKeys ? JSON.stringify(nectarKeys) : null, expiresAt);
  return row<CacheEntry>(db.prepare("SELECT * FROM flight_cache WHERE id = ?").get(id));
}

export function getCacheStats(): { entries: number; total_hits: number; expired: number } {
  const db = getDb();
  const entries = row<{ count: number }>(db.prepare("SELECT COUNT(*) as count FROM flight_cache").get()).count;
  const totalHits = row<{ total: number }>(db.prepare("SELECT COALESCE(SUM(hit_count), 0) as total FROM flight_cache").get()).total;
  const expired = row<{ count: number }>(db.prepare("SELECT COUNT(*) as count FROM flight_cache WHERE expires_at <= datetime('now')").get()).count;
  return { entries, total_hits: totalHits, expired };
}

export function clearFlightCache(blueprintId?: string, flightId?: string): number {
  const db = getDb();
  if (blueprintId && flightId) {
    const result = db.prepare("DELETE FROM flight_cache WHERE blueprint_id = ? AND flight_id = ?").run(blueprintId, flightId);
    return Number(result.changes);
  }
  if (blueprintId) {
    const result = db.prepare("DELETE FROM flight_cache WHERE blueprint_id = ?").run(blueprintId);
    return Number(result.changes);
  }
  const result = db.prepare("DELETE FROM flight_cache").run();
  return Number(result.changes);
}

export function deleteExpiredCache(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM flight_cache WHERE expires_at <= datetime('now')").run();
  return Number(result.changes);
}

// ── Phase 15: Template Queries ──────────────────────────────────────

export function insertTemplate(
  name: string,
  blueprintId: string,
  description?: string,
  variables?: string,
  priority?: number,
  options?: string,
): SwarmTemplate {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO swarm_templates (id, name, blueprint_id, description, variables, priority, options)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, blueprintId, description ?? null, variables ?? "{}", priority ?? 5, options ?? "{}");
  return row<SwarmTemplate>(db.prepare("SELECT * FROM swarm_templates WHERE id = ?").get(id));
}

export function getTemplate(name: string): SwarmTemplate | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM swarm_templates WHERE name = ?").get(name);
  return result ? row<SwarmTemplate>(result) : undefined;
}

export function listTemplates(): SwarmTemplate[] {
  const db = getDb();
  return rows<SwarmTemplate>(db.prepare("SELECT * FROM swarm_templates ORDER BY usage_count DESC, name ASC").all());
}

export function deleteTemplate(name: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM swarm_templates WHERE name = ?").run(name);
  return Number(result.changes) > 0;
}

export function incrementTemplateUsage(name: string): void {
  const db = getDb();
  db.prepare("UPDATE swarm_templates SET usage_count = usage_count + 1, updated_at = datetime('now') WHERE name = ?").run(name);
}

// ── Phase 15: Budget-aware swarm queries ─────────────────────────────

export function getBudgetExceededSwarms(): Array<{ id: string; swarm_number: number; token_budget: number; budget_action: string; consumed: number }> {
  const db = getDb();
  return db.prepare(
    `SELECT s.id, s.swarm_number, s.token_budget, s.budget_action,
       COALESCE((SELECT SUM(input_tokens + output_tokens) FROM flight_usage WHERE swarm_id = s.id), 0) as consumed
     FROM swarms s
     WHERE s.status = 'buzzing' AND s.token_budget > 0
     AND COALESCE((SELECT SUM(input_tokens + output_tokens) FROM flight_usage WHERE swarm_id = s.id), 0) > s.token_budget
     AND s.budget_action = 'warn'`,
  ).all() as Array<{ id: string; swarm_number: number; token_budget: number; budget_action: string; consumed: number }>;
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
