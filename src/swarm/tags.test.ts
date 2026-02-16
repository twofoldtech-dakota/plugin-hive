import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

// ── In-memory DB setup ──────────────────────────────────────────────
// We test the tag/search logic against an in-memory SQLite DB
// to avoid touching the real data directory.

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");

  db.exec(`
    CREATE TABLE IF NOT EXISTS swarms (
      id TEXT PRIMARY KEY,
      swarm_number INTEGER,
      blueprint_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT DEFAULT 'buzzing',
      nectar TEXT DEFAULT '{}',
      notify_url TEXT,
      chain_id TEXT,
      parent_swarm_id TEXT,
      trigger_config TEXT,
      priority INTEGER DEFAULT 5,
      schedule_at TEXT,
      replayed_from TEXT,
      token_budget INTEGER DEFAULT 0,
      budget_action TEXT DEFAULT 'warn',
      parent_flight_id TEXT,
      profile TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS swarm_tags (
      id TEXT PRIMARY KEY,
      swarm_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(swarm_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_swarm_tags_swarm ON swarm_tags(swarm_id);
    CREATE INDEX IF NOT EXISTS idx_swarm_tags_key ON swarm_tags(key);
  `);

  return db;
}

function insertSwarm(db: DatabaseSync, id: string, number: number, blueprintId: string, task: string, status: string = "buzzing"): void {
  db.prepare(
    "INSERT INTO swarms (id, swarm_number, blueprint_id, task, status) VALUES (?, ?, ?, ?, ?)",
  ).run(id, number, blueprintId, task, status);
}

function insertTag(db: DatabaseSync, swarmId: string, key: string, value: string): void {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO swarm_tags (id, swarm_id, key, value) VALUES (?, ?, ?, ?)
     ON CONFLICT(swarm_id, key) DO UPDATE SET value = excluded.value`,
  ).run(id, swarmId, key, value);
}

describe("Swarm Tags", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("should insert and retrieve tags", () => {
    const swarmId = randomUUID();
    insertSwarm(db, swarmId, 1, "test-bp", "test task");
    insertTag(db, swarmId, "env", "production");
    insertTag(db, swarmId, "team", "backend");

    const tags = db.prepare("SELECT * FROM swarm_tags WHERE swarm_id = ? ORDER BY key").all(swarmId) as Array<{ key: string; value: string }>;
    expect(tags).toHaveLength(2);
    expect(tags[0].key).toBe("env");
    expect(tags[0].value).toBe("production");
    expect(tags[1].key).toBe("team");
    expect(tags[1].value).toBe("backend");
  });

  it("should update tag value on conflict", () => {
    const swarmId = randomUUID();
    insertSwarm(db, swarmId, 1, "test-bp", "test task");
    insertTag(db, swarmId, "env", "staging");
    insertTag(db, swarmId, "env", "production");

    const tags = db.prepare("SELECT * FROM swarm_tags WHERE swarm_id = ?").all(swarmId) as Array<{ value: string }>;
    expect(tags).toHaveLength(1);
    expect(tags[0].value).toBe("production");
  });

  it("should delete tags", () => {
    const swarmId = randomUUID();
    insertSwarm(db, swarmId, 1, "test-bp", "test task");
    insertTag(db, swarmId, "env", "production");

    const deleted = Number(db.prepare("DELETE FROM swarm_tags WHERE swarm_id = ? AND key = ?").run(swarmId, "env").changes);
    expect(deleted).toBe(1);

    const remaining = db.prepare("SELECT * FROM swarm_tags WHERE swarm_id = ?").all(swarmId) as unknown[];
    expect(remaining).toHaveLength(0);
  });

  it("should search swarms by tag using EXISTS", () => {
    const s1 = randomUUID();
    const s2 = randomUUID();
    insertSwarm(db, s1, 1, "test-bp", "task one");
    insertSwarm(db, s2, 2, "test-bp", "task two");
    insertTag(db, s1, "env", "prod");
    insertTag(db, s2, "env", "staging");

    const results = db.prepare(
      `SELECT * FROM swarms s WHERE EXISTS (
        SELECT 1 FROM swarm_tags t WHERE t.swarm_id = s.id AND t.key = ? AND t.value = ?
      )`,
    ).all("env", "prod") as Array<{ id: string }>;

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(s1);
  });

  it("should search with multiple tag filters", () => {
    const s1 = randomUUID();
    const s2 = randomUUID();
    insertSwarm(db, s1, 1, "test-bp", "task one");
    insertSwarm(db, s2, 2, "test-bp", "task two");
    insertTag(db, s1, "env", "prod");
    insertTag(db, s1, "team", "backend");
    insertTag(db, s2, "env", "prod");
    insertTag(db, s2, "team", "frontend");

    const results = db.prepare(
      `SELECT * FROM swarms s
       WHERE EXISTS (SELECT 1 FROM swarm_tags t WHERE t.swarm_id = s.id AND t.key = ? AND t.value = ?)
       AND EXISTS (SELECT 1 FROM swarm_tags t WHERE t.swarm_id = s.id AND t.key = ? AND t.value = ?)`,
    ).all("env", "prod", "team", "backend") as Array<{ id: string }>;

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(s1);
  });

  it("should list distinct tag keys", () => {
    const s1 = randomUUID();
    const s2 = randomUUID();
    insertSwarm(db, s1, 1, "test-bp", "task one");
    insertSwarm(db, s2, 2, "test-bp", "task two");
    insertTag(db, s1, "env", "prod");
    insertTag(db, s1, "team", "backend");
    insertTag(db, s2, "env", "staging");
    insertTag(db, s2, "priority", "high");

    const keys = (db.prepare("SELECT DISTINCT key FROM swarm_tags ORDER BY key ASC").all() as Array<{ key: string }>).map(r => r.key);
    expect(keys).toEqual(["env", "priority", "team"]);
  });

  it("should filter swarms by date range", () => {
    const s1 = randomUUID();
    insertSwarm(db, s1, 1, "test-bp", "old task");

    // Manually set created_at for date range testing
    db.prepare("UPDATE swarms SET created_at = '2025-01-01 00:00:00' WHERE id = ?").run(s1);

    const results = db.prepare(
      "SELECT * FROM swarms WHERE created_at >= ? AND created_at <= ?",
    ).all("2025-01-01 00:00:00", "2025-12-31 23:59:59") as Array<{ id: string }>;

    expect(results).toHaveLength(1);
  });
});
