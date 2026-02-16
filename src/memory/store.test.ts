import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");

  db.exec(`
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
  `);

  return db;
}

function upsertMemory(db: DatabaseSync, beeId: string, namespace: string, key: string, value: string, expiresAt?: string): void {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO bee_memory (id, bee_id, namespace, key, value, expires_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(bee_id, namespace, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = datetime('now')`,
  ).run(id, beeId, namespace, key, value, expiresAt ?? null);
}

describe("Bee Memory", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("should store and recall memories", () => {
    upsertMemory(db, "bee-worker", "default", "last_file", "src/main.ts");
    upsertMemory(db, "bee-worker", "default", "pattern", "observer");

    const memories = db.prepare(
      "SELECT * FROM bee_memory WHERE bee_id = ? AND namespace = ? ORDER BY key",
    ).all("bee-worker", "default") as Array<{ key: string; value: string }>;

    expect(memories).toHaveLength(2);
    expect(memories[0].key).toBe("last_file");
    expect(memories[1].key).toBe("pattern");
  });

  it("should scope by namespace", () => {
    upsertMemory(db, "bee-worker", "default", "file", "a.ts");
    upsertMemory(db, "bee-worker", "feature-dev", "file", "b.ts");

    const defaultMem = db.prepare(
      "SELECT * FROM bee_memory WHERE bee_id = ? AND namespace = ?",
    ).all("bee-worker", "default") as Array<{ value: string }>;

    const bpMem = db.prepare(
      "SELECT * FROM bee_memory WHERE bee_id = ? AND namespace = ?",
    ).all("bee-worker", "feature-dev") as Array<{ value: string }>;

    expect(defaultMem).toHaveLength(1);
    expect(defaultMem[0].value).toBe("a.ts");
    expect(bpMem).toHaveLength(1);
    expect(bpMem[0].value).toBe("b.ts");
  });

  it("should update existing memory on conflict", () => {
    upsertMemory(db, "bee-worker", "default", "key1", "old");
    upsertMemory(db, "bee-worker", "default", "key1", "new");

    const memories = db.prepare(
      "SELECT * FROM bee_memory WHERE bee_id = ? AND namespace = ? AND key = ?",
    ).all("bee-worker", "default", "key1") as Array<{ value: string }>;

    expect(memories).toHaveLength(1);
    expect(memories[0].value).toBe("new");
  });

  it("should delete memories by bee_id", () => {
    upsertMemory(db, "bee-worker", "default", "a", "1");
    upsertMemory(db, "bee-worker", "default", "b", "2");
    upsertMemory(db, "bee-inspector", "default", "c", "3");

    const deleted = Number(db.prepare("DELETE FROM bee_memory WHERE bee_id = ?").run("bee-worker").changes);
    expect(deleted).toBe(2);

    const remaining = db.prepare("SELECT * FROM bee_memory").all() as unknown[];
    expect(remaining).toHaveLength(1);
  });

  it("should filter out expired memories", () => {
    upsertMemory(db, "bee-worker", "default", "active", "yes");
    upsertMemory(db, "bee-worker", "default", "expired", "yes", "2020-01-01 00:00:00");

    const active = db.prepare(
      "SELECT * FROM bee_memory WHERE bee_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))",
    ).all("bee-worker") as Array<{ key: string }>;

    expect(active).toHaveLength(1);
    expect(active[0].key).toBe("active");
  });

  it("should prune expired memories", () => {
    upsertMemory(db, "bee-worker", "default", "expired1", "yes", "2020-01-01 00:00:00");
    upsertMemory(db, "bee-worker", "default", "expired2", "yes", "2021-01-01 00:00:00");
    upsertMemory(db, "bee-worker", "default", "active", "yes");

    const pruned = Number(db.prepare("DELETE FROM bee_memory WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").run().changes);
    expect(pruned).toBe(2);

    const remaining = db.prepare("SELECT * FROM bee_memory").all() as unknown[];
    expect(remaining).toHaveLength(1);
  });

  it("should parse MEMORY: lines from output", () => {
    const output = `STATUS: done
Some text here
MEMORY: last_dir = src/components
MEMORY: pattern = singleton
Regular output
MEMORY: complexity = high`;

    const captured: Array<{ key: string; value: string }> = [];
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/^MEMORY:\s*(\S+)\s*=\s*(.+)$/);
      if (match) {
        captured.push({ key: match[1], value: match[2].trim() });
      }
    }

    expect(captured).toHaveLength(3);
    expect(captured[0]).toEqual({ key: "last_dir", value: "src/components" });
    expect(captured[1]).toEqual({ key: "pattern", value: "singleton" });
    expect(captured[2]).toEqual({ key: "complexity", value: "high" });
  });

  it("should get memory stats", () => {
    upsertMemory(db, "bee-worker", "default", "a", "1");
    upsertMemory(db, "bee-inspector", "default", "b", "2");
    upsertMemory(db, "bee-worker", "default", "expired", "3", "2020-01-01 00:00:00");

    const totalRows = (db.prepare("SELECT COUNT(*) as count FROM bee_memory").get() as { count: number }).count;
    const totalBees = (db.prepare("SELECT COUNT(DISTINCT bee_id) as count FROM bee_memory").get() as { count: number }).count;
    const expired = (db.prepare("SELECT COUNT(*) as count FROM bee_memory WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").get() as { count: number }).count;

    expect(totalRows).toBe(3);
    expect(totalBees).toBe(2);
    expect(expired).toBe(1);
  });
});
