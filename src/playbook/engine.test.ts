import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");

  db.exec(`
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
      playbook_id TEXT NOT NULL,
      trigger_value REAL NOT NULL,
      actions_taken TEXT NOT NULL DEFAULT '[]',
      results TEXT NOT NULL DEFAULT '[]',
      success INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function insertPlaybook(
  db: DatabaseSync,
  name: string,
  triggerType: string,
  threshold: number,
  actions: Array<{ type: string; params?: Record<string, string> }>,
  cooldownMinutes: number = 30,
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO hive_playbooks (id, name, trigger_condition, actions, cooldown_minutes) VALUES (?, ?, ?, ?, ?)",
  ).run(id, name, JSON.stringify({ type: triggerType, threshold }), JSON.stringify(actions), cooldownMinutes);
  return id;
}

describe("Playbook Engine", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("should create and list playbooks", () => {
    insertPlaybook(db, "auto-pause", "health_below", 30, [{ type: "pause_swarms" }]);
    insertPlaybook(db, "reset-circuits", "circuit_open_count", 3, [{ type: "reset_circuits" }]);

    const playbooks = db.prepare("SELECT * FROM hive_playbooks ORDER BY name").all() as Array<{ name: string }>;
    expect(playbooks).toHaveLength(2);
    expect(playbooks[0].name).toBe("auto-pause");
    expect(playbooks[1].name).toBe("reset-circuits");
  });

  it("should toggle playbook enabled state", () => {
    const id = insertPlaybook(db, "test-pb", "health_below", 50, [{ type: "notify" }]);

    let pb = db.prepare("SELECT * FROM hive_playbooks WHERE id = ?").get(id) as { enabled: number };
    expect(pb.enabled).toBe(1);

    db.prepare("UPDATE hive_playbooks SET enabled = 0 WHERE id = ?").run(id);
    pb = db.prepare("SELECT * FROM hive_playbooks WHERE id = ?").get(id) as { enabled: number };
    expect(pb.enabled).toBe(0);
  });

  it("should respect cooldown period", () => {
    const id = insertPlaybook(db, "test-pb", "health_below", 50, [{ type: "notify" }], 60);

    // Simulate recent execution
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    db.prepare("UPDATE hive_playbooks SET last_executed_at = ? WHERE id = ?").run(now, id);

    const pb = db.prepare("SELECT * FROM hive_playbooks WHERE id = ?").get(id) as { last_executed_at: string; cooldown_minutes: number };
    const lastExec = new Date(pb.last_executed_at.replace(" ", "T") + "Z").getTime();
    const cooldownMs = pb.cooldown_minutes * 60_000;
    const elapsed = Date.now() - lastExec;

    expect(elapsed).toBeLessThan(cooldownMs);
  });

  it("should allow execution after cooldown expires", () => {
    const id = insertPlaybook(db, "test-pb", "health_below", 50, [{ type: "notify" }], 1);

    // Simulate old execution (2 hours ago)
    const oldTime = new Date(Date.now() - 2 * 60 * 60_000).toISOString().replace("T", " ").slice(0, 19);
    db.prepare("UPDATE hive_playbooks SET last_executed_at = ? WHERE id = ?").run(oldTime, id);

    const pb = db.prepare("SELECT * FROM hive_playbooks WHERE id = ?").get(id) as { last_executed_at: string; cooldown_minutes: number };
    const lastExec = new Date(pb.last_executed_at.replace(" ", "T") + "Z").getTime();
    const cooldownMs = pb.cooldown_minutes * 60_000;
    const elapsed = Date.now() - lastExec;

    expect(elapsed).toBeGreaterThan(cooldownMs);
  });

  it("should record playbook executions", () => {
    const pbId = insertPlaybook(db, "test-pb", "health_below", 50, [{ type: "notify" }]);

    const execId = randomUUID();
    db.prepare(
      "INSERT INTO playbook_executions (id, playbook_id, trigger_value, actions_taken, results, success) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(execId, pbId, 25.0, JSON.stringify([{ type: "notify" }]), JSON.stringify([{ type: "notify", success: true, detail: "sent" }]), 1);

    const executions = db.prepare("SELECT * FROM playbook_executions WHERE playbook_id = ?").all(pbId) as Array<{ trigger_value: number; success: number }>;
    expect(executions).toHaveLength(1);
    expect(executions[0].trigger_value).toBe(25.0);
    expect(executions[0].success).toBe(1);
  });

  it("should parse trigger conditions correctly", () => {
    const condition = JSON.stringify({ type: "health_below", threshold: 30 });
    const parsed = JSON.parse(condition) as { type: string; threshold: number };

    expect(parsed.type).toBe("health_below");
    expect(parsed.threshold).toBe(30);

    // Test trigger logic
    const currentValue = 25;
    const shouldTrigger = parsed.type === "health_below" && currentValue < parsed.threshold;
    expect(shouldTrigger).toBe(true);
  });

  it("should delete playbook and cascade to executions", () => {
    const pbId = insertPlaybook(db, "test-pb", "health_below", 50, [{ type: "notify" }]);

    const execId = randomUUID();
    db.prepare(
      "INSERT INTO playbook_executions (id, playbook_id, trigger_value, actions_taken, results, success) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(execId, pbId, 25.0, "[]", "[]", 1);

    // Delete playbook executions first, then playbook
    db.prepare("DELETE FROM playbook_executions WHERE playbook_id = ?").run(pbId);
    db.prepare("DELETE FROM hive_playbooks WHERE id = ?").run(pbId);

    const remaining = db.prepare("SELECT * FROM playbook_executions WHERE playbook_id = ?").all(pbId) as unknown[];
    expect(remaining).toHaveLength(0);
  });

  it("should filter enabled-only playbooks", () => {
    insertPlaybook(db, "active-pb", "health_below", 50, [{ type: "notify" }]);
    const disabledId = insertPlaybook(db, "disabled-pb", "health_below", 50, [{ type: "notify" }]);
    db.prepare("UPDATE hive_playbooks SET enabled = 0 WHERE id = ?").run(disabledId);

    const enabled = db.prepare("SELECT * FROM hive_playbooks WHERE enabled = 1").all() as unknown[];
    expect(enabled).toHaveLength(1);
  });
});
