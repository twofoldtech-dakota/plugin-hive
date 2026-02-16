import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  deleteOldEvents: vi.fn(),
  deleteOldTraces: vi.fn(),
  deleteOldChecks: vi.fn(),
  deleteOldWebhooks: vi.fn(),
  deleteOrphanedPulses: vi.fn(),
  setMetaValue: vi.fn(),
}));

vi.mock("../config/global.js", () => ({
  getConfigNumber: vi.fn((key: string, fallback: number) => {
    const defaults: Record<string, number> = {
      event_retention_days: 30,
      trace_retention_days: 14,
      check_retention_days: 7,
      webhook_retention_days: 14,
    };
    return defaults[key] ?? fallback;
  }),
}));

vi.mock("../lib/events.js", () => ({
  emitEvent: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../lib/time.js", () => ({
  nowUtc: vi.fn(() => "2026-02-16 12:00:00"),
}));

import { runMaintenance } from "./janitor.js";
import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";

const mockDb = vi.mocked(db);
const mockEmit = vi.mocked(emitEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runMaintenance", () => {
  it("deletes old data and emits event", () => {
    mockDb.deleteOldEvents.mockReturnValue(10);
    mockDb.deleteOldTraces.mockReturnValue(5);
    mockDb.deleteOldChecks.mockReturnValue(3);
    mockDb.deleteOldWebhooks.mockReturnValue(2);
    mockDb.deleteOrphanedPulses.mockReturnValue(1);

    const result = runMaintenance(false);

    expect(result.dry_run).toBe(false);
    expect(result.deleted.events).toBe(10);
    expect(result.deleted.traces).toBe(5);
    expect(result.deleted.checks).toBe(3);
    expect(result.deleted.webhooks).toBe(2);
    expect(result.deleted.pulses).toBe(1);
    expect(result.total_deleted).toBe(21);

    expect(mockDb.setMetaValue).toHaveBeenCalledWith("last_maintenance_at", "2026-02-16 12:00:00");
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "maintenance.completed" }),
    );
  });

  it("dry run does not delete anything", () => {
    const result = runMaintenance(true);

    expect(result.dry_run).toBe(true);
    expect(result.total_deleted).toBe(0);
    expect(mockDb.deleteOldEvents).not.toHaveBeenCalled();
    expect(mockDb.setMetaValue).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
