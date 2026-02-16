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
  ModelRoutingLogRecord,
  ModelTier,
  FlightBaselineRecord,
  AnomalyAlertRecord,
  NectarShareRecord,
  RegistryCacheRecord,
  BlueprintRatingRecord,
  NotificationChannelRecord,
  NotificationRouteRecord,
  WebhookTokenRecord,
  WebhookAuditRecord,
  SwarmScheduleRecord,
  ScheduleRunRecord,
  CircuitBreakerRecord,
  CircuitState,
  DeadLetterRecord,
  BlueprintTestCaseRecord,
  BlueprintTestRunRecord,
  HealthSnapshot,
  SwarmTagRecord,
  HiveProfileRecord,
  BeeMemoryRecord,
  PlaybookRecord,
  PlaybookExecutionRecord,
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

  // Phase 16 — new columns on flights
  const flightCols16 = db.prepare("PRAGMA table_info(flights)").all() as Array<{ name: string }>;
  if (!flightCols16.some(c => c.name === "sub_swarm_config")) {
    db.exec("ALTER TABLE flights ADD COLUMN sub_swarm_config TEXT");
  }
  if (!flightCols16.some(c => c.name === "child_swarm_id")) {
    db.exec("ALTER TABLE flights ADD COLUMN child_swarm_id TEXT");
  }
  if (!flightCols16.some(c => c.name === "failover_config")) {
    db.exec("ALTER TABLE flights ADD COLUMN failover_config TEXT");
  }
  if (!flightCols16.some(c => c.name === "model_override")) {
    db.exec("ALTER TABLE flights ADD COLUMN model_override TEXT");
  }
  if (!flightCols16.some(c => c.name === "original_bee_id")) {
    db.exec("ALTER TABLE flights ADD COLUMN original_bee_id TEXT");
  }

  // Phase 16 — new column on swarms
  const swarmCols16 = db.prepare("PRAGMA table_info(swarms)").all() as Array<{ name: string }>;
  if (!swarmCols16.some(c => c.name === "parent_flight_id")) {
    db.exec("ALTER TABLE swarms ADD COLUMN parent_flight_id TEXT");
  }

  // Phase 16 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_routing_log (
      id TEXT PRIMARY KEY,
      flight_id TEXT NOT NULL,
      swarm_id TEXT NOT NULL,
      bee_id TEXT NOT NULL,
      selected_tier TEXT NOT NULL,
      selected_model TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_model_routing_swarm ON model_routing_log(swarm_id);

    CREATE TABLE IF NOT EXISTS flight_baselines (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      flight_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      mean REAL NOT NULL DEFAULT 0,
      stddev REAL NOT NULL DEFAULT 0,
      sample_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(blueprint_id, flight_id, metric)
    );
    CREATE INDEX IF NOT EXISTS idx_flight_baselines_bp ON flight_baselines(blueprint_id);

    CREATE TABLE IF NOT EXISTS anomaly_alerts (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL,
      flight_id TEXT NOT NULL,
      blueprint_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      observed_value REAL NOT NULL,
      expected_mean REAL NOT NULL,
      expected_stddev REAL NOT NULL,
      sigma_deviation REAL NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_swarm ON anomaly_alerts(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_ack ON anomaly_alerts(acknowledged);
  `);

  // Phase 16 — seed config
  db.exec(`
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('anomaly_detection_enabled', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('anomaly_sigma_threshold', '2.0');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('anomaly_critical_sigma', '3.0');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('anomaly_min_samples', '10');
  `);

  // Phase 17 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS nectar_shares (
      id TEXT PRIMARY KEY,
      target_swarm_id TEXT NOT NULL,
      target_flight_id TEXT NOT NULL,
      source_swarm_id TEXT NOT NULL,
      key TEXT NOT NULL,
      from_key TEXT NOT NULL,
      value TEXT,
      resolved_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_nectar_shares_target ON nectar_shares(target_swarm_id);

    CREATE TABLE IF NOT EXISTS registry_cache (
      id TEXT PRIMARY KEY,
      registry_url TEXT NOT NULL,
      blueprint_id TEXT NOT NULL,
      name TEXT,
      description TEXT,
      version INTEGER,
      author TEXT,
      tags TEXT,
      cached_at TEXT DEFAULT (datetime('now')),
      UNIQUE(registry_url, blueprint_id)
    );

    CREATE TABLE IF NOT EXISTS blueprint_ratings (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_blueprint_ratings_bp ON blueprint_ratings(blueprint_id);

    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      channel_type TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_routes (
      id TEXT PRIMARY KEY,
      event_pattern TEXT NOT NULL,
      channel_id TEXT NOT NULL REFERENCES notification_channels(id),
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notification_routes_channel ON notification_routes(channel_id);

    CREATE TABLE IF NOT EXISTS webhook_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      permissions TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS webhook_audit_log (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_audit_token ON webhook_audit_log(token_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_audit_created ON webhook_audit_log(created_at);
  `);

  // Phase 17 — new column on flights
  if (!flightCols16.some(c => c.name === "nectar_refs")) {
    db.exec("ALTER TABLE flights ADD COLUMN nectar_refs TEXT");
  }

  // Phase 17 — seed config
  db.exec(`
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('registry_url', '');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('registry_cache_hours', '24');
  `);

  // Phase 18 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      blueprint_id TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      task_template TEXT NOT NULL,
      variables TEXT DEFAULT '{}',
      overlap_behavior TEXT DEFAULT 'skip',
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER DEFAULT 5,
      last_run_at TEXT,
      next_run_at TEXT,
      run_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON swarm_schedules(enabled, next_run_at);

    CREATE TABLE IF NOT EXISTS schedule_runs (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES swarm_schedules(id),
      swarm_id TEXT,
      triggered_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON schedule_runs(schedule_id);

    CREATE TABLE IF NOT EXISTS circuit_breakers (
      id TEXT PRIMARY KEY,
      bee_id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'closed',
      failure_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      last_failure_at TEXT,
      opened_at TEXT,
      half_open_at TEXT,
      threshold INTEGER DEFAULT 5,
      timeout_minutes INTEGER DEFAULT 10,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_circuit_state ON circuit_breakers(state);

    CREATE TABLE IF NOT EXISTS dead_letters (
      id TEXT PRIMARY KEY,
      flight_uuid TEXT NOT NULL,
      swarm_id TEXT NOT NULL,
      flight_id TEXT NOT NULL,
      bee_id TEXT NOT NULL,
      last_error TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      error_context TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      replayed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dl_swarm ON dead_letters(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_dl_status ON dead_letters(status);

    CREATE TABLE IF NOT EXISTS blueprint_test_cases (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      mock_inputs TEXT NOT NULL DEFAULT '{}',
      mock_outputs TEXT NOT NULL DEFAULT '{}',
      assertions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_test_cases_bp ON blueprint_test_cases(blueprint_id);

    CREATE TABLE IF NOT EXISTS blueprint_test_runs (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      results TEXT NOT NULL DEFAULT '[]',
      duration_ms INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_test_runs_bp ON blueprint_test_runs(blueprint_id);

    CREATE TABLE IF NOT EXISTS hive_health_snapshots (
      id TEXT PRIMARY KEY,
      composite_score REAL NOT NULL,
      factors TEXT NOT NULL DEFAULT '[]',
      computed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_health_computed ON hive_health_snapshots(computed_at);
  `);

  // Phase 18 — new column on flights
  const flightCols18 = db.prepare("PRAGMA table_info(flights)").all() as Array<{ name: string }>;
  if (!flightCols18.some(c => c.name === "on_exhausted")) {
    db.exec("ALTER TABLE flights ADD COLUMN on_exhausted TEXT");
  }

  // Phase 18 — seed config
  db.exec(`
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('schedule_evaluation_enabled', 'true');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('circuit_breaker_enabled', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('circuit_breaker_threshold', '5');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('circuit_breaker_timeout_minutes', '10');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('health_alert_threshold', '50');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('health_snapshot_enabled', 'true');
  `);

  // Phase 19 — new tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_tags (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL REFERENCES swarms(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(swarm_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_swarm_tags_swarm ON swarm_tags(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_swarm_tags_key ON swarm_tags(key);

    CREATE TABLE IF NOT EXISTS hive_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      overrides TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bee_memory (
      id TEXT PRIMARY KEY,
      bee_id TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(bee_id, namespace, key)
    );
    CREATE INDEX IF NOT EXISTS idx_bee_memory_bee ON bee_memory(bee_id);
    CREATE INDEX IF NOT EXISTS idx_bee_memory_expires ON bee_memory(expires_at);

    CREATE TABLE IF NOT EXISTS hive_playbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      trigger_condition TEXT NOT NULL,
      actions TEXT NOT NULL DEFAULT '[]',
      cooldown_minutes INTEGER NOT NULL DEFAULT 30,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_executed_at TEXT,
      execution_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playbook_executions (
      id TEXT PRIMARY KEY,
      playbook_id TEXT NOT NULL REFERENCES hive_playbooks(id),
      trigger_value REAL NOT NULL,
      actions_taken TEXT NOT NULL DEFAULT '[]',
      results TEXT NOT NULL DEFAULT '[]',
      success INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_playbook_executions_pb ON playbook_executions(playbook_id);
  `);

  // Phase 19 — new columns on swarms
  const swarmCols19 = db.prepare("PRAGMA table_info(swarms)").all() as Array<{ name: string }>;
  if (!swarmCols19.some(c => c.name === "profile")) {
    db.exec("ALTER TABLE swarms ADD COLUMN profile TEXT");
  }

  // Phase 19 — new columns on blueprints
  const bpCols19 = db.prepare("PRAGMA table_info(blueprints)").all() as Array<{ name: string }>;
  if (!bpCols19.some(c => c.name === "requires")) {
    db.exec("ALTER TABLE blueprints ADD COLUMN requires TEXT");
  }

  // Phase 19 — seed config
  db.exec(`
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('profile_enabled', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('bee_memory_enabled', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('bee_memory_max_entries', '10');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('bee_memory_max_chars', '2000');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('bee_memory_auto_capture', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('playbooks_enabled', 'false');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('memory_retention_days', '30');
    INSERT OR IGNORE INTO hive_config (key, value) VALUES ('playbook_history_retention_days', '14');
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
  type: "single" | "loop" | "sub_swarm" = "single",
  loopConfig?: string,
  dependsOn?: string[],
  whenClause?: string,
  gate?: string,
  retryStrategy?: string,
  produces?: string[],
  requires?: string[],
  subSwarmConfig?: string,
  failoverConfig?: string,
  nectarRefs?: string,
  onExhausted?: string,
): FlightRecord {
  const db = getDb();
  const id = randomUUID();
  const dependsOnJson = dependsOn && dependsOn.length > 0 ? JSON.stringify(dependsOn) : null;
  const producesJson = produces && produces.length > 0 ? JSON.stringify(produces) : null;
  const requiresJson = requires && requires.length > 0 ? JSON.stringify(requires) : null;
  db.prepare(
    `INSERT INTO flights (id, swarm_id, flight_id, bee_id, flight_index, input_template, expects, status, max_retries, type, loop_config, depends_on, when_clause, gate, retry_strategy, produces, requires, sub_swarm_config, failover_config, nectar_refs, on_exhausted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, swarmId, flightId, beeId, flightIndex, inputTemplate, expects, status, maxRetries, type, loopConfig ?? null, dependsOnJson, whenClause ?? null, gate ?? null, retryStrategy ?? null, producesJson, requiresJson, subSwarmConfig ?? null, failoverConfig ?? null, nectarRefs ?? null, onExhausted ?? null);
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

// ── Phase 16: Model Routing Log ─────────────────────────────────────

export function insertModelRoutingLog(
  flightId: string,
  swarmId: string,
  beeId: string,
  selectedTier: ModelTier,
  selectedModel: string,
  reason: string,
): ModelRoutingLogRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO model_routing_log (id, flight_id, swarm_id, bee_id, selected_tier, selected_model, reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, flightId, swarmId, beeId, selectedTier, selectedModel, reason);
  return row<ModelRoutingLogRecord>(db.prepare("SELECT * FROM model_routing_log WHERE id = ?").get(id));
}

export function getModelRoutingHistory(swarmId?: string, limit: number = 50): ModelRoutingLogRecord[] {
  const db = getDb();
  if (swarmId) {
    return rows<ModelRoutingLogRecord>(
      db.prepare("SELECT * FROM model_routing_log WHERE swarm_id = ? ORDER BY created_at DESC LIMIT ?").all(swarmId, limit),
    );
  }
  return rows<ModelRoutingLogRecord>(
    db.prepare("SELECT * FROM model_routing_log ORDER BY created_at DESC LIMIT ?").all(limit),
  );
}

// ── Phase 16: Flight Baselines ──────────────────────────────────────

export function upsertFlightBaseline(
  blueprintId: string,
  flightId: string,
  metric: string,
  mean: number,
  stddev: number,
  sampleCount: number,
): FlightBaselineRecord {
  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM flight_baselines WHERE blueprint_id = ? AND flight_id = ? AND metric = ?",
  ).get(blueprintId, flightId, metric);
  if (existing) {
    db.prepare(
      "UPDATE flight_baselines SET mean = ?, stddev = ?, sample_count = ?, updated_at = datetime('now') WHERE blueprint_id = ? AND flight_id = ? AND metric = ?",
    ).run(mean, stddev, sampleCount, blueprintId, flightId, metric);
  } else {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO flight_baselines (id, blueprint_id, flight_id, metric, mean, stddev, sample_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, blueprintId, flightId, metric, mean, stddev, sampleCount);
  }
  return row<FlightBaselineRecord>(
    db.prepare("SELECT * FROM flight_baselines WHERE blueprint_id = ? AND flight_id = ? AND metric = ?").get(blueprintId, flightId, metric),
  );
}

export function getFlightBaseline(blueprintId: string, flightId: string, metric: string): FlightBaselineRecord | undefined {
  const db = getDb();
  const result = db.prepare(
    "SELECT * FROM flight_baselines WHERE blueprint_id = ? AND flight_id = ? AND metric = ?",
  ).get(blueprintId, flightId, metric);
  return result ? row<FlightBaselineRecord>(result) : undefined;
}

export function getBaselinesForBlueprint(blueprintId: string): FlightBaselineRecord[] {
  const db = getDb();
  return rows<FlightBaselineRecord>(
    db.prepare("SELECT * FROM flight_baselines WHERE blueprint_id = ? ORDER BY flight_id, metric").all(blueprintId),
  );
}

// ── Phase 16: Anomaly Alerts ────────────────────────────────────────

export function insertAnomalyAlert(
  swarmId: string,
  flightId: string,
  blueprintId: string,
  metric: string,
  observedValue: number,
  expectedMean: number,
  expectedStddev: number,
  sigmaDeviation: number,
  severity: "warning" | "critical",
): AnomalyAlertRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO anomaly_alerts (id, swarm_id, flight_id, blueprint_id, metric, observed_value, expected_mean, expected_stddev, sigma_deviation, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, swarmId, flightId, blueprintId, metric, observedValue, expectedMean, expectedStddev, sigmaDeviation, severity);
  return row<AnomalyAlertRecord>(db.prepare("SELECT * FROM anomaly_alerts WHERE id = ?").get(id));
}

export function getAnomalyAlerts(filters?: { swarm_id?: string; acknowledged?: boolean; limit?: number }): AnomalyAlertRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters?.swarm_id) {
    conditions.push("swarm_id = ?");
    params.push(filters.swarm_id);
  }
  if (filters?.acknowledged !== undefined) {
    conditions.push("acknowledged = ?");
    params.push(filters.acknowledged ? 1 : 0);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const limit = filters?.limit ?? 50;
  const stmt = db.prepare(`SELECT * FROM anomaly_alerts ${where} ORDER BY created_at DESC LIMIT ?`);
  return rows<AnomalyAlertRecord>(stmt.all(...params, limit));
}

export function acknowledgeAnomalyAlert(id: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE anomaly_alerts SET acknowledged = 1 WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

export function getUnacknowledgedCriticalAlerts(): AnomalyAlertRecord[] {
  const db = getDb();
  return rows<AnomalyAlertRecord>(
    db.prepare("SELECT * FROM anomaly_alerts WHERE severity = 'critical' AND acknowledged = 0 ORDER BY created_at DESC").all(),
  );
}

// ── Phase 16: Sub-swarm queries ─────────────────────────────────────

export function setFlightChildSwarm(flightUuid: string, childSwarmId: string): void {
  const db = getDb();
  db.prepare("UPDATE flights SET child_swarm_id = ?, status = 'sub_swarm', updated_at = datetime('now') WHERE id = ?").run(childSwarmId, flightUuid);
}

export function setSwarmParentFlight(swarmId: string, parentFlightId: string): void {
  const db = getDb();
  db.prepare("UPDATE swarms SET parent_flight_id = ?, updated_at = datetime('now') WHERE id = ?").run(parentFlightId, swarmId);
}

export function getSubSwarmFlights(): FlightRecord[] {
  const db = getDb();
  return rows<FlightRecord>(
    db.prepare("SELECT * FROM flights WHERE status = 'sub_swarm'").all(),
  );
}

export function getFlightByChildSwarm(childSwarmId: string): FlightRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM flights WHERE child_swarm_id = ?").get(childSwarmId);
  return result ? row<FlightRecord>(result) : undefined;
}

// ── Phase 16: Failover queries ──────────────────────────────────────

export function setFlightModelOverride(flightUuid: string, model: string, originalBeeId?: string): void {
  const db = getDb();
  const sets = ["model_override = ?", "updated_at = datetime('now')"];
  const params: SQLInputValue[] = [model];
  if (originalBeeId) {
    sets.push("original_bee_id = ?");
    params.push(originalBeeId);
  }
  params.push(flightUuid);
  db.prepare(`UPDATE flights SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

// ── Phase 16: Historical flight data for baselines ──────────────────

export function getCompletedFlightDurations(blueprintId: string, flightId: string, limit: number = 100): number[] {
  const db = getDb();
  const results = db.prepare(
    `SELECT ROUND((julianday(f.completed_at) - julianday(f.started_at)) * 86400) as dur
     FROM flights f JOIN swarms s ON f.swarm_id = s.id
     WHERE s.blueprint_id = ? AND f.flight_id = ? AND f.status = 'done'
       AND f.started_at IS NOT NULL AND f.completed_at IS NOT NULL
     ORDER BY f.completed_at DESC LIMIT ?`,
  ).all(blueprintId, flightId, limit) as Array<{ dur: number | null }>;
  return results.filter(r => r.dur !== null).map(r => r.dur!);
}

export function getCompletedFlightTokens(blueprintId: string, flightId: string, limit: number = 100): number[] {
  const db = getDb();
  const results = db.prepare(
    `SELECT (u.input_tokens + u.output_tokens) as tokens
     FROM flight_usage u
     JOIN flights f ON u.flight_id = f.id
     JOIN swarms s ON f.swarm_id = s.id
     WHERE s.blueprint_id = ? AND f.flight_id = ? AND f.status = 'done'
     ORDER BY u.created_at DESC LIMIT ?`,
  ).all(blueprintId, flightId, limit) as Array<{ tokens: number }>;
  return results.map(r => r.tokens);
}

// ── Phase 17: Nectar Shares ─────────────────────────────────────────

export function insertNectarShare(
  targetSwarmId: string,
  targetFlightId: string,
  sourceSwarmId: string,
  key: string,
  fromKey: string,
): NectarShareRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO nectar_shares (id, target_swarm_id, target_flight_id, source_swarm_id, key, from_key) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, targetSwarmId, targetFlightId, sourceSwarmId, key, fromKey);
  return row<NectarShareRecord>(db.prepare("SELECT * FROM nectar_shares WHERE id = ?").get(id));
}

export function getNectarSharesForSwarm(swarmId: string): NectarShareRecord[] {
  const db = getDb();
  return rows<NectarShareRecord>(
    db.prepare("SELECT * FROM nectar_shares WHERE target_swarm_id = ? ORDER BY created_at ASC").all(swarmId),
  );
}

export function resolveNectarShare(id: string, value: string): void {
  const db = getDb();
  db.prepare("UPDATE nectar_shares SET value = ?, resolved_at = datetime('now') WHERE id = ?").run(value, id);
}

export function getLatestCompletedSwarmForBlueprint(blueprintId: string): SwarmRecord | undefined {
  const db = getDb();
  const result = db.prepare(
    "SELECT * FROM swarms WHERE blueprint_id = ? AND status = 'completed' ORDER BY updated_at DESC LIMIT 1",
  ).get(blueprintId);
  return result ? row<SwarmRecord>(result) : undefined;
}

// ── Phase 17: Registry Cache ────────────────────────────────────────

export function upsertRegistryCache(
  registryUrl: string,
  blueprintId: string,
  name: string | null,
  description: string | null,
  version: number | null,
  author: string | null,
  tags: string[] | null,
): RegistryCacheRecord {
  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM registry_cache WHERE registry_url = ? AND blueprint_id = ?",
  ).get(registryUrl, blueprintId);
  if (existing) {
    db.prepare(
      "UPDATE registry_cache SET name = ?, description = ?, version = ?, author = ?, tags = ?, cached_at = datetime('now') WHERE registry_url = ? AND blueprint_id = ?",
    ).run(name, description, version, author, tags ? JSON.stringify(tags) : null, registryUrl, blueprintId);
  } else {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO registry_cache (id, registry_url, blueprint_id, name, description, version, author, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, registryUrl, blueprintId, name, description, version, author, tags ? JSON.stringify(tags) : null);
  }
  return row<RegistryCacheRecord>(
    db.prepare("SELECT * FROM registry_cache WHERE registry_url = ? AND blueprint_id = ?").get(registryUrl, blueprintId),
  );
}

export function searchRegistryCache(query: string, registryUrl?: string): RegistryCacheRecord[] {
  const db = getDb();
  const conditions = ["(blueprint_id LIKE ? OR name LIKE ? OR description LIKE ?)"];
  const params: SQLInputValue[] = [`%${query}%`, `%${query}%`, `%${query}%`];
  if (registryUrl) {
    conditions.push("registry_url = ?");
    params.push(registryUrl);
  }
  return rows<RegistryCacheRecord>(
    db.prepare(`SELECT * FROM registry_cache WHERE ${conditions.join(" AND ")} ORDER BY cached_at DESC LIMIT 50`).all(...params),
  );
}

export function getRegistryCacheAge(registryUrl: string): number | null {
  const db = getDb();
  const result = db.prepare(
    "SELECT MIN(cached_at) as oldest FROM registry_cache WHERE registry_url = ?",
  ).get(registryUrl) as { oldest: string | null } | undefined;
  if (!result?.oldest) return null;
  return (Date.now() - new Date(result.oldest.replace(" ", "T") + "Z").getTime()) / (1000 * 60 * 60);
}

export function clearRegistryCache(registryUrl?: string): number {
  const db = getDb();
  if (registryUrl) {
    return Number(db.prepare("DELETE FROM registry_cache WHERE registry_url = ?").run(registryUrl).changes);
  }
  return Number(db.prepare("DELETE FROM registry_cache").run().changes);
}

// ── Phase 17: Blueprint Ratings ─────────────────────────────────────

export function insertBlueprintRating(blueprintId: string, rating: number, comment?: string): BlueprintRatingRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO blueprint_ratings (id, blueprint_id, rating, comment) VALUES (?, ?, ?, ?)",
  ).run(id, blueprintId, rating, comment ?? null);
  return row<BlueprintRatingRecord>(db.prepare("SELECT * FROM blueprint_ratings WHERE id = ?").get(id));
}

export function getBlueprintRatings(blueprintId: string): { ratings: BlueprintRatingRecord[]; average: number; count: number } {
  const db = getDb();
  const ratings = rows<BlueprintRatingRecord>(
    db.prepare("SELECT * FROM blueprint_ratings WHERE blueprint_id = ? ORDER BY created_at DESC").all(blueprintId),
  );
  const avg = db.prepare("SELECT AVG(rating) as avg FROM blueprint_ratings WHERE blueprint_id = ?").get(blueprintId) as { avg: number | null };
  return { ratings, average: avg?.avg ?? 0, count: ratings.length };
}

// ── Phase 17: Notification Channels ─────────────────────────────────

export function insertNotificationChannel(
  name: string,
  channelType: string,
  config: string,
): NotificationChannelRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO notification_channels (id, name, channel_type, config) VALUES (?, ?, ?, ?)",
  ).run(id, name, channelType, config);
  return row<NotificationChannelRecord>(db.prepare("SELECT * FROM notification_channels WHERE id = ?").get(id));
}

export function getNotificationChannel(id: string): NotificationChannelRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM notification_channels WHERE id = ?").get(id);
  return result ? row<NotificationChannelRecord>(result) : undefined;
}

export function listNotificationChannels(): NotificationChannelRecord[] {
  const db = getDb();
  return rows<NotificationChannelRecord>(
    db.prepare("SELECT * FROM notification_channels ORDER BY name ASC").all(),
  );
}

export function deleteNotificationChannel(id: string): boolean {
  const db = getDb();
  db.prepare("DELETE FROM notification_routes WHERE channel_id = ?").run(id);
  return Number(db.prepare("DELETE FROM notification_channels WHERE id = ?").run(id).changes) > 0;
}

export function insertNotificationRoute(
  eventPattern: string,
  channelId: string,
  priority: number = 0,
): NotificationRouteRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO notification_routes (id, event_pattern, channel_id, priority) VALUES (?, ?, ?, ?)",
  ).run(id, eventPattern, channelId, priority);
  return row<NotificationRouteRecord>(db.prepare("SELECT * FROM notification_routes WHERE id = ?").get(id));
}

export function listNotificationRoutes(): NotificationRouteRecord[] {
  const db = getDb();
  return rows<NotificationRouteRecord>(
    db.prepare("SELECT * FROM notification_routes ORDER BY priority DESC, created_at ASC").all(),
  );
}

export function deleteNotificationRoute(id: string): boolean {
  const db = getDb();
  return Number(db.prepare("DELETE FROM notification_routes WHERE id = ?").run(id).changes) > 0;
}

export function getRoutesForEvent(eventType: string): Array<{ route: NotificationRouteRecord; channel: NotificationChannelRecord }> {
  const db = getDb();
  const routes = listNotificationRoutes();
  const matched: Array<{ route: NotificationRouteRecord; channel: NotificationChannelRecord }> = [];
  for (const route of routes) {
    if (matchGlobPattern(route.event_pattern, eventType)) {
      const channel = getNotificationChannel(route.channel_id);
      if (channel && channel.enabled) {
        matched.push({ route, channel });
      }
    }
  }
  return matched;
}

function matchGlobPattern(pattern: string, value: string): boolean {
  const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
  return regex.test(value);
}

// ── Phase 17: Webhook Tokens ────────────────────────────────────────

export function insertWebhookToken(
  name: string,
  tokenHash: string,
  permissions: string[],
  expiresAt?: string,
): WebhookTokenRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO webhook_tokens (id, name, token_hash, permissions, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, name, tokenHash, JSON.stringify(permissions), expiresAt ?? null);
  return row<WebhookTokenRecord>(db.prepare("SELECT * FROM webhook_tokens WHERE id = ?").get(id));
}

export function getWebhookTokenByHash(tokenHash: string): WebhookTokenRecord | undefined {
  const db = getDb();
  const result = db.prepare(
    "SELECT * FROM webhook_tokens WHERE token_hash = ? AND revoked_at IS NULL",
  ).get(tokenHash);
  return result ? row<WebhookTokenRecord>(result) : undefined;
}

export function listWebhookTokens(): WebhookTokenRecord[] {
  const db = getDb();
  return rows<WebhookTokenRecord>(
    db.prepare("SELECT * FROM webhook_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC").all(),
  );
}

export function revokeWebhookToken(id: string): boolean {
  const db = getDb();
  return Number(db.prepare("UPDATE webhook_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").run(id).changes) > 0;
}

// ── Phase 17: Webhook Audit Log ─────────────────────────────────────

export function insertWebhookAudit(
  tokenId: string,
  action: string,
  payload?: Record<string, unknown>,
  ipAddress?: string,
  status: "success" | "denied" | "error" = "success",
): WebhookAuditRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO webhook_audit_log (id, token_id, action, payload, ip_address, status) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, tokenId, action, payload ? JSON.stringify(payload) : null, ipAddress ?? null, status);
  return row<WebhookAuditRecord>(db.prepare("SELECT * FROM webhook_audit_log WHERE id = ?").get(id));
}

export function getWebhookAuditLog(filters?: { token_id?: string; limit?: number }): WebhookAuditRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters?.token_id) {
    conditions.push("token_id = ?");
    params.push(filters.token_id);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const limit = filters?.limit ?? 50;
  return rows<WebhookAuditRecord>(
    db.prepare(`SELECT * FROM webhook_audit_log ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit),
  );
}

// ── Phase 18: Swarm Schedules ────────────────────────────────────────

export function insertSchedule(
  name: string,
  blueprintId: string,
  cronExpression: string,
  taskTemplate: string,
  variables?: string,
  overlapBehavior?: string,
  priority?: number,
  nextRunAt?: string,
): SwarmScheduleRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO swarm_schedules (id, name, blueprint_id, cron_expression, task_template, variables, overlap_behavior, priority, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, blueprintId, cronExpression, taskTemplate, variables ?? "{}", overlapBehavior ?? "skip", priority ?? 5, nextRunAt ?? null);
  return row<SwarmScheduleRecord>(db.prepare("SELECT * FROM swarm_schedules WHERE id = ?").get(id));
}

export function getSchedule(id: string): SwarmScheduleRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM swarm_schedules WHERE id = ?").get(id);
  return result ? row<SwarmScheduleRecord>(result) : undefined;
}

export function getScheduleByName(name: string): SwarmScheduleRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM swarm_schedules WHERE name = ?").get(name);
  return result ? row<SwarmScheduleRecord>(result) : undefined;
}

export function listSchedules(filters?: { blueprint_id?: string; enabled?: boolean }): SwarmScheduleRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters?.blueprint_id) {
    conditions.push("blueprint_id = ?");
    params.push(filters.blueprint_id);
  }
  if (filters?.enabled !== undefined) {
    conditions.push("enabled = ?");
    params.push(filters.enabled ? 1 : 0);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const stmt = db.prepare(`SELECT * FROM swarm_schedules ${where} ORDER BY created_at DESC`);
  return rows<SwarmScheduleRecord>(params.length > 0 ? stmt.all(...params) : stmt.all());
}

export function deleteSchedule(id: string): boolean {
  const db = getDb();
  db.prepare("DELETE FROM schedule_runs WHERE schedule_id = ?").run(id);
  return Number(db.prepare("DELETE FROM swarm_schedules WHERE id = ?").run(id).changes) > 0;
}

export function updateSchedule(
  id: string,
  updates: Partial<Pick<SwarmScheduleRecord, "enabled" | "last_run_at" | "next_run_at" | "run_count">>,
): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: SQLInputValue[] = [];
  if (updates.enabled !== undefined) {
    sets.push("enabled = ?");
    params.push(updates.enabled);
  }
  if (updates.last_run_at !== undefined) {
    sets.push("last_run_at = ?");
    params.push(updates.last_run_at);
  }
  if (updates.next_run_at !== undefined) {
    sets.push("next_run_at = ?");
    params.push(updates.next_run_at);
  }
  if (updates.run_count !== undefined) {
    sets.push("run_count = ?");
    params.push(updates.run_count);
  }
  params.push(id);
  db.prepare(`UPDATE swarm_schedules SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function getDueSchedules(): SwarmScheduleRecord[] {
  const db = getDb();
  return rows<SwarmScheduleRecord>(
    db.prepare("SELECT * FROM swarm_schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= datetime('now')").all(),
  );
}

export function insertScheduleRun(scheduleId: string, swarmId: string | null, triggeredAt: string, status: string = "started"): ScheduleRunRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO schedule_runs (id, schedule_id, swarm_id, triggered_at, status) VALUES (?, ?, ?, ?, ?)",
  ).run(id, scheduleId, swarmId, triggeredAt, status);
  return row<ScheduleRunRecord>(db.prepare("SELECT * FROM schedule_runs WHERE id = ?").get(id));
}

export function getScheduleHistory(scheduleId: string, limit: number = 20): ScheduleRunRecord[] {
  const db = getDb();
  return rows<ScheduleRunRecord>(
    db.prepare("SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY triggered_at DESC LIMIT ?").all(scheduleId, limit),
  );
}

export function getLastScheduleRun(scheduleId: string): ScheduleRunRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY triggered_at DESC LIMIT 1").get(scheduleId);
  return result ? row<ScheduleRunRecord>(result) : undefined;
}

// ── Phase 18: Circuit Breakers ──────────────────────────────────────

export function getCircuitBreaker(beeId: string): CircuitBreakerRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM circuit_breakers WHERE bee_id = ?").get(beeId);
  return result ? row<CircuitBreakerRecord>(result) : undefined;
}

export function upsertCircuitBreaker(
  beeId: string,
  updates: Partial<Pick<CircuitBreakerRecord, "state" | "failure_count" | "success_count" | "last_failure_at" | "opened_at" | "half_open_at" | "threshold" | "timeout_minutes">>,
): CircuitBreakerRecord {
  const db = getDb();
  const existing = getCircuitBreaker(beeId);
  if (existing) {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: SQLInputValue[] = [];
    if (updates.state !== undefined) { sets.push("state = ?"); params.push(updates.state); }
    if (updates.failure_count !== undefined) { sets.push("failure_count = ?"); params.push(updates.failure_count); }
    if (updates.success_count !== undefined) { sets.push("success_count = ?"); params.push(updates.success_count); }
    if (updates.last_failure_at !== undefined) { sets.push("last_failure_at = ?"); params.push(updates.last_failure_at); }
    if (updates.opened_at !== undefined) { sets.push("opened_at = ?"); params.push(updates.opened_at); }
    if (updates.half_open_at !== undefined) { sets.push("half_open_at = ?"); params.push(updates.half_open_at); }
    if (updates.threshold !== undefined) { sets.push("threshold = ?"); params.push(updates.threshold); }
    if (updates.timeout_minutes !== undefined) { sets.push("timeout_minutes = ?"); params.push(updates.timeout_minutes); }
    params.push(beeId);
    db.prepare(`UPDATE circuit_breakers SET ${sets.join(", ")} WHERE bee_id = ?`).run(...params);
  } else {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO circuit_breakers (id, bee_id, state, failure_count, success_count, last_failure_at, opened_at, half_open_at, threshold, timeout_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, beeId, updates.state ?? "closed", updates.failure_count ?? 0, updates.success_count ?? 0, updates.last_failure_at ?? null, updates.opened_at ?? null, updates.half_open_at ?? null, updates.threshold ?? 5, updates.timeout_minutes ?? 10);
  }
  return getCircuitBreaker(beeId)!;
}

export function listCircuitBreakers(state?: CircuitState): CircuitBreakerRecord[] {
  const db = getDb();
  if (state) {
    return rows<CircuitBreakerRecord>(db.prepare("SELECT * FROM circuit_breakers WHERE state = ? ORDER BY updated_at DESC").all(state));
  }
  return rows<CircuitBreakerRecord>(db.prepare("SELECT * FROM circuit_breakers ORDER BY updated_at DESC").all());
}

export function getOpenCircuits(): CircuitBreakerRecord[] {
  const db = getDb();
  return rows<CircuitBreakerRecord>(
    db.prepare("SELECT * FROM circuit_breakers WHERE state IN ('open', 'half_open') ORDER BY updated_at DESC").all(),
  );
}

export function getExpiredOpenCircuits(timeoutMinutes: number): CircuitBreakerRecord[] {
  const db = getDb();
  return rows<CircuitBreakerRecord>(
    db.prepare(
      `SELECT * FROM circuit_breakers WHERE state = 'open' AND opened_at IS NOT NULL
       AND opened_at <= datetime('now', '-' || ? || ' minutes')`,
    ).all(timeoutMinutes),
  );
}

// ── Phase 18: Dead Letter Queue ─────────────────────────────────────

export function insertDeadLetter(
  flightUuid: string,
  swarmId: string,
  flightId: string,
  beeId: string,
  lastError: string,
  retryCount: number,
  errorContext?: string,
): DeadLetterRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO dead_letters (id, flight_uuid, swarm_id, flight_id, bee_id, last_error, retry_count, error_context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, flightUuid, swarmId, flightId, beeId, lastError, retryCount, errorContext ?? null);
  return row<DeadLetterRecord>(db.prepare("SELECT * FROM dead_letters WHERE id = ?").get(id));
}

export function getDeadLetter(id: string): DeadLetterRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM dead_letters WHERE id = ?").get(id);
  return result ? row<DeadLetterRecord>(result) : undefined;
}

export function listDeadLetters(filters?: { swarm_id?: string; status?: string }): DeadLetterRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters?.swarm_id) {
    conditions.push("swarm_id = ?");
    params.push(filters.swarm_id);
  }
  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const stmt = db.prepare(`SELECT * FROM dead_letters ${where} ORDER BY created_at DESC`);
  return rows<DeadLetterRecord>(params.length > 0 ? stmt.all(...params) : stmt.all());
}

export function updateDeadLetter(id: string, updates: Partial<Pick<DeadLetterRecord, "status" | "replayed_at">>): void {
  const db = getDb();
  const sets: string[] = [];
  const params: SQLInputValue[] = [];
  if (updates.status !== undefined) { sets.push("status = ?"); params.push(updates.status); }
  if (updates.replayed_at !== undefined) { sets.push("replayed_at = ?"); params.push(updates.replayed_at); }
  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE dead_letters SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function getPendingDeadLetterCount(): number {
  const db = getDb();
  return row<{ count: number }>(db.prepare("SELECT COUNT(*) as count FROM dead_letters WHERE status = 'pending'").get()).count;
}

// ── Phase 18: Blueprint Test Cases ──────────────────────────────────

export function insertTestCase(
  blueprintId: string,
  name: string,
  mockInputs: string,
  mockOutputs: string,
  assertions: string,
  description?: string,
): BlueprintTestCaseRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO blueprint_test_cases (id, blueprint_id, name, description, mock_inputs, mock_outputs, assertions) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, blueprintId, name, description ?? null, mockInputs, mockOutputs, assertions);
  return row<BlueprintTestCaseRecord>(db.prepare("SELECT * FROM blueprint_test_cases WHERE id = ?").get(id));
}

export function getTestCase(id: string): BlueprintTestCaseRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM blueprint_test_cases WHERE id = ?").get(id);
  return result ? row<BlueprintTestCaseRecord>(result) : undefined;
}

export function listTestCases(blueprintId: string): BlueprintTestCaseRecord[] {
  const db = getDb();
  return rows<BlueprintTestCaseRecord>(
    db.prepare("SELECT * FROM blueprint_test_cases WHERE blueprint_id = ? ORDER BY created_at ASC").all(blueprintId),
  );
}

export function deleteTestCase(id: string): boolean {
  const db = getDb();
  return Number(db.prepare("DELETE FROM blueprint_test_cases WHERE id = ?").run(id).changes) > 0;
}

export function insertTestRun(
  blueprintId: string,
  testCaseId: string,
  passed: boolean,
  results: string,
  durationMs: number,
): BlueprintTestRunRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO blueprint_test_runs (id, blueprint_id, test_case_id, passed, results, duration_ms) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, blueprintId, testCaseId, passed ? 1 : 0, results, durationMs);
  return row<BlueprintTestRunRecord>(db.prepare("SELECT * FROM blueprint_test_runs WHERE id = ?").get(id));
}

export function getTestRunsForBlueprint(blueprintId: string, limit: number = 20): BlueprintTestRunRecord[] {
  const db = getDb();
  return rows<BlueprintTestRunRecord>(
    db.prepare("SELECT * FROM blueprint_test_runs WHERE blueprint_id = ? ORDER BY created_at DESC LIMIT ?").all(blueprintId, limit),
  );
}

// ── Phase 18: Health Snapshots ──────────────────────────────────────

export function insertHealthSnapshot(compositeScore: number, factors: string): HealthSnapshot {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO hive_health_snapshots (id, composite_score, factors) VALUES (?, ?, ?)",
  ).run(id, compositeScore, factors);
  return row<HealthSnapshot>(db.prepare("SELECT * FROM hive_health_snapshots WHERE id = ?").get(id));
}

export function getHealthHistory(limit: number = 20): HealthSnapshot[] {
  const db = getDb();
  return rows<HealthSnapshot>(
    db.prepare("SELECT * FROM hive_health_snapshots ORDER BY computed_at DESC LIMIT ?").all(limit),
  );
}

export function getLatestHealthSnapshot(): HealthSnapshot | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM hive_health_snapshots ORDER BY computed_at DESC LIMIT 1").get();
  return result ? row<HealthSnapshot>(result) : undefined;
}

// ── Phase 18: Query helpers ─────────────────────────────────────────

export function getOverdueScheduleCount(): number {
  const db = getDb();
  return row<{ count: number }>(
    db.prepare("SELECT COUNT(*) as count FROM swarm_schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= datetime('now')").get(),
  ).count;
}

export function getQueuedSwarmCount(): number {
  const db = getDb();
  return row<{ count: number }>(
    db.prepare("SELECT COUNT(*) as count FROM swarms WHERE status = 'queued'").get(),
  ).count;
}

export function getBuzzingSwarmBudgets(): Array<{ id: string; token_budget: number; consumed: number }> {
  const db = getDb();
  return db.prepare(
    `SELECT s.id, s.token_budget,
       COALESCE((SELECT SUM(input_tokens + output_tokens) FROM flight_usage WHERE swarm_id = s.id), 0) as consumed
     FROM swarms s WHERE s.status = 'buzzing' AND s.token_budget > 0`,
  ).all() as Array<{ id: string; token_budget: number; consumed: number }>;
}

export function getActiveBeeSuccessRates(): Array<{ bee_id: string; success_rate: number }> {
  const db = getDb();
  return db.prepare(
    "SELECT bee_id, success_rate FROM bee_stats WHERE total_flights >= 3 ORDER BY updated_at DESC LIMIT 50",
  ).all() as Array<{ bee_id: string; success_rate: number }>;
}

// ── Phase 19: Swarm Tags ────────────────────────────────────────────

export function insertSwarmTag(swarmId: string, key: string, value: string): SwarmTagRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO swarm_tags (id, swarm_id, key, value) VALUES (?, ?, ?, ?)
     ON CONFLICT(swarm_id, key) DO UPDATE SET value = excluded.value`,
  ).run(id, swarmId, key, value);
  const result = db.prepare("SELECT * FROM swarm_tags WHERE swarm_id = ? AND key = ?").get(swarmId, key);
  return row<SwarmTagRecord>(result);
}

export function deleteSwarmTag(swarmId: string, key: string): boolean {
  const db = getDb();
  return Number(db.prepare("DELETE FROM swarm_tags WHERE swarm_id = ? AND key = ?").run(swarmId, key).changes) > 0;
}

export function getSwarmTags(swarmId: string): SwarmTagRecord[] {
  const db = getDb();
  return rows<SwarmTagRecord>(db.prepare("SELECT * FROM swarm_tags WHERE swarm_id = ? ORDER BY key ASC").all(swarmId));
}

export function listTagKeys(): string[] {
  const db = getDb();
  const result = db.prepare("SELECT DISTINCT key FROM swarm_tags ORDER BY key ASC").all() as Array<{ key: string }>;
  return result.map(r => r.key);
}

export function searchSwarms(filters: {
  query?: string;
  status?: SwarmStatus;
  blueprint_id?: string;
  tags?: Record<string, string>;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): { swarms: SwarmRecord[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];

  if (filters.query) {
    conditions.push("(s.task LIKE ? OR s.id LIKE ?)");
    params.push(`%${filters.query}%`, `%${filters.query}%`);
  }
  if (filters.status) {
    conditions.push("s.status = ?");
    params.push(filters.status);
  }
  if (filters.blueprint_id) {
    conditions.push("s.blueprint_id = ?");
    params.push(filters.blueprint_id);
  }
  if (filters.from) {
    conditions.push("s.created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("s.created_at <= ?");
    params.push(filters.to);
  }

  // Tag filters via EXISTS subqueries
  if (filters.tags) {
    for (const [key, value] of Object.entries(filters.tags)) {
      conditions.push("EXISTS (SELECT 1 FROM swarm_tags t WHERE t.swarm_id = s.id AND t.key = ? AND t.value = ?)");
      params.push(key, value);
    }
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  // Count
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM swarms s ${where}`);
  const total = row<{ total: number }>(params.length > 0 ? countStmt.get(...params) : countStmt.get()).total;

  // Results
  const dataParams = [...params, limit, offset];
  const dataStmt = db.prepare(`SELECT s.* FROM swarms s ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`);
  const swarms = rows<SwarmRecord>(dataStmt.all(...dataParams));

  return { swarms, total };
}

// ── Phase 19: Hive Profiles ─────────────────────────────────────────

export function insertProfile(name: string, description: string | null, overrides: string): HiveProfileRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO hive_profiles (id, name, description, overrides) VALUES (?, ?, ?, ?)",
  ).run(id, name, description, overrides);
  return row<HiveProfileRecord>(db.prepare("SELECT * FROM hive_profiles WHERE id = ?").get(id));
}

export function getProfile(name: string): HiveProfileRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM hive_profiles WHERE name = ?").get(name);
  return result ? row<HiveProfileRecord>(result) : undefined;
}

export function getProfileById(id: string): HiveProfileRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM hive_profiles WHERE id = ?").get(id);
  return result ? row<HiveProfileRecord>(result) : undefined;
}

export function listProfiles(): HiveProfileRecord[] {
  const db = getDb();
  return rows<HiveProfileRecord>(db.prepare("SELECT * FROM hive_profiles ORDER BY name ASC").all());
}

export function deleteProfile(name: string): boolean {
  const db = getDb();
  return Number(db.prepare("DELETE FROM hive_profiles WHERE name = ?").run(name).changes) > 0;
}

export function updateProfile(name: string, updates: Partial<Pick<HiveProfileRecord, "description" | "overrides">>): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: SQLInputValue[] = [];
  if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
  if (updates.overrides !== undefined) { sets.push("overrides = ?"); params.push(updates.overrides); }
  params.push(name);
  db.prepare(`UPDATE hive_profiles SET ${sets.join(", ")} WHERE name = ?`).run(...params);
}

// ── Phase 19: Bee Memory ────────────────────────────────────────────

export function upsertBeeMemory(beeId: string, namespace: string, key: string, value: string, expiresAt?: string): BeeMemoryRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO bee_memory (id, bee_id, namespace, key, value, expires_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(bee_id, namespace, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = datetime('now')`,
  ).run(id, beeId, namespace, key, value, expiresAt ?? null);
  const result = db.prepare("SELECT * FROM bee_memory WHERE bee_id = ? AND namespace = ? AND key = ?").get(beeId, namespace, key);
  return row<BeeMemoryRecord>(result);
}

export function getBeeMemories(beeId: string, namespace?: string): BeeMemoryRecord[] {
  const db = getDb();
  if (namespace) {
    return rows<BeeMemoryRecord>(
      db.prepare("SELECT * FROM bee_memory WHERE bee_id = ? AND namespace = ? AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY updated_at DESC").all(beeId, namespace),
    );
  }
  return rows<BeeMemoryRecord>(
    db.prepare("SELECT * FROM bee_memory WHERE bee_id = ? AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY updated_at DESC").all(beeId),
  );
}

export function deleteBeeMemory(beeId: string, namespace?: string, key?: string): number {
  const db = getDb();
  if (key && namespace) {
    return Number(db.prepare("DELETE FROM bee_memory WHERE bee_id = ? AND namespace = ? AND key = ?").run(beeId, namespace, key).changes);
  }
  if (namespace) {
    return Number(db.prepare("DELETE FROM bee_memory WHERE bee_id = ? AND namespace = ?").run(beeId, namespace).changes);
  }
  return Number(db.prepare("DELETE FROM bee_memory WHERE bee_id = ?").run(beeId).changes);
}

export function pruneExpiredMemories(): number {
  const db = getDb();
  return Number(db.prepare("DELETE FROM bee_memory WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").run().changes);
}

export function getBeeMemoryStats(): { total_entries: number; total_bees: number; expired: number } {
  const db = getDb();
  const total = row<{ count: number }>(db.prepare("SELECT COUNT(*) as count FROM bee_memory").get()).count;
  const bees = row<{ count: number }>(db.prepare("SELECT COUNT(DISTINCT bee_id) as count FROM bee_memory").get()).count;
  const expired = row<{ count: number }>(db.prepare("SELECT COUNT(*) as count FROM bee_memory WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").get()).count;
  return { total_entries: total, total_bees: bees, expired };
}

// ── Phase 19: Playbooks ─────────────────────────────────────────────

export function insertPlaybook(
  name: string,
  description: string | null,
  triggerCondition: string,
  actions: string,
  cooldownMinutes: number = 30,
): PlaybookRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO hive_playbooks (id, name, description, trigger_condition, actions, cooldown_minutes) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, name, description, triggerCondition, actions, cooldownMinutes);
  return row<PlaybookRecord>(db.prepare("SELECT * FROM hive_playbooks WHERE id = ?").get(id));
}

export function getPlaybook(id: string): PlaybookRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM hive_playbooks WHERE id = ?").get(id);
  return result ? row<PlaybookRecord>(result) : undefined;
}

export function getPlaybookByName(name: string): PlaybookRecord | undefined {
  const db = getDb();
  const result = db.prepare("SELECT * FROM hive_playbooks WHERE name = ?").get(name);
  return result ? row<PlaybookRecord>(result) : undefined;
}

export function listPlaybooks(enabled?: boolean): PlaybookRecord[] {
  const db = getDb();
  if (enabled !== undefined) {
    return rows<PlaybookRecord>(db.prepare("SELECT * FROM hive_playbooks WHERE enabled = ? ORDER BY name ASC").all(enabled ? 1 : 0));
  }
  return rows<PlaybookRecord>(db.prepare("SELECT * FROM hive_playbooks ORDER BY name ASC").all());
}

export function deletePlaybook(id: string): boolean {
  const db = getDb();
  db.prepare("DELETE FROM playbook_executions WHERE playbook_id = ?").run(id);
  return Number(db.prepare("DELETE FROM hive_playbooks WHERE id = ?").run(id).changes) > 0;
}

export function updatePlaybook(
  id: string,
  updates: Partial<Pick<PlaybookRecord, "enabled" | "last_executed_at" | "execution_count" | "description" | "actions" | "trigger_condition" | "cooldown_minutes">>,
): void {
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: SQLInputValue[] = [];
  if (updates.enabled !== undefined) { sets.push("enabled = ?"); params.push(updates.enabled); }
  if (updates.last_executed_at !== undefined) { sets.push("last_executed_at = ?"); params.push(updates.last_executed_at); }
  if (updates.execution_count !== undefined) { sets.push("execution_count = ?"); params.push(updates.execution_count); }
  if (updates.description !== undefined) { sets.push("description = ?"); params.push(updates.description); }
  if (updates.actions !== undefined) { sets.push("actions = ?"); params.push(updates.actions); }
  if (updates.trigger_condition !== undefined) { sets.push("trigger_condition = ?"); params.push(updates.trigger_condition); }
  if (updates.cooldown_minutes !== undefined) { sets.push("cooldown_minutes = ?"); params.push(updates.cooldown_minutes); }
  params.push(id);
  db.prepare(`UPDATE hive_playbooks SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function insertPlaybookExecution(
  playbookId: string,
  triggerValue: number,
  actionsTaken: string,
  results: string,
  success: boolean,
): PlaybookExecutionRecord {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO playbook_executions (id, playbook_id, trigger_value, actions_taken, results, success) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, playbookId, triggerValue, actionsTaken, results, success ? 1 : 0);
  return row<PlaybookExecutionRecord>(db.prepare("SELECT * FROM playbook_executions WHERE id = ?").get(id));
}

export function getPlaybookExecutions(playbookId?: string, limit: number = 20): PlaybookExecutionRecord[] {
  const db = getDb();
  if (playbookId) {
    return rows<PlaybookExecutionRecord>(
      db.prepare("SELECT * FROM playbook_executions WHERE playbook_id = ? ORDER BY created_at DESC LIMIT ?").all(playbookId, limit),
    );
  }
  return rows<PlaybookExecutionRecord>(
    db.prepare("SELECT * FROM playbook_executions ORDER BY created_at DESC LIMIT ?").all(limit),
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
