import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  getSwarmOrArchive: vi.fn(),
  getBlueprint: vi.fn(),
  setSwarmReplayedFrom: vi.fn(),
}));

vi.mock("../swarm/create.js", () => ({
  createSwarmFromBlueprint: vi.fn(),
}));

vi.mock("../lib/events.js", () => ({
  emitEvent: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { replaySwarm } from "./replay.js";
import * as db from "../db.js";
import { createSwarmFromBlueprint } from "../swarm/create.js";
import { emitEvent } from "../lib/events.js";

const mockDb = vi.mocked(db);
const mockCreate = vi.mocked(createSwarmFromBlueprint);
const mockEmit = vi.mocked(emitEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("replaySwarm", () => {
  it("returns error when swarm not found", () => {
    mockDb.getSwarmOrArchive.mockReturnValue(undefined);
    const result = replaySwarm("not-found");
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("not found");
  });

  it("returns error when swarm is still buzzing", () => {
    mockDb.getSwarmOrArchive.mockReturnValue({
      source: "swarm",
      data: { id: "s1", status: "buzzing", blueprint_id: "bp1", task: "test" },
    } as any);
    const result = replaySwarm("s1");
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("buzzing");
  });

  it("returns error when blueprint not installed", () => {
    mockDb.getSwarmOrArchive.mockReturnValue({
      source: "swarm",
      data: { id: "s1", status: "completed", blueprint_id: "gone-bp", task: "test" },
    } as any);
    mockDb.getBlueprint.mockReturnValue(undefined);
    const result = replaySwarm("s1");
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("no longer installed");
  });

  it("replays a completed swarm successfully", () => {
    mockDb.getSwarmOrArchive.mockReturnValue({
      source: "swarm",
      data: { id: "s1", status: "completed", blueprint_id: "bp1", task: "original task" },
    } as any);
    mockDb.getBlueprint.mockReturnValue({ id: "bp1", spec: "{}" } as any);
    mockCreate.mockReturnValue({
      success: true,
      data: { id: "s2", number: 5, blueprint: "bp1", task: "original task", status: "buzzing", flights: 3 },
    });

    const result = replaySwarm("s1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.new_swarm_id).toBe("s2");
      expect(result.new_swarm_number).toBe(5);
      expect(result.replayed_from).toBe("s1");
    }
    expect(mockDb.setSwarmReplayedFrom).toHaveBeenCalledWith("s2", "s1");
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "swarm.replayed" }));
  });

  it("replays with task override", () => {
    mockDb.getSwarmOrArchive.mockReturnValue({
      source: "swarm",
      data: { id: "s1", status: "failed", blueprint_id: "bp1", task: "original" },
    } as any);
    mockDb.getBlueprint.mockReturnValue({ id: "bp1", spec: "{}" } as any);
    mockCreate.mockReturnValue({
      success: true,
      data: { id: "s3", number: 6, blueprint: "bp1", task: "new task", status: "buzzing", flights: 3 },
    });

    const result = replaySwarm("s1", { task: "new task", priority: 8 });
    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith("bp1", "new task", undefined, undefined, undefined, { priority: 8 });
  });

  it("replays from archived swarm", () => {
    mockDb.getSwarmOrArchive.mockReturnValue({
      source: "archive",
      data: { id: "arch1", blueprint_id: "bp1", task: "old task", original_status: "completed" },
    } as any);
    mockDb.getBlueprint.mockReturnValue({ id: "bp1", spec: "{}" } as any);
    mockCreate.mockReturnValue({
      success: true,
      data: { id: "s4", number: 7, blueprint: "bp1", task: "old task", status: "buzzing", flights: 2 },
    });

    const result = replaySwarm("arch1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.replayed_from).toBe("arch1");
    }
  });
});
