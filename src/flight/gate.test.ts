import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db before importing gate
vi.mock("../db.js", () => ({
  getFlight: vi.fn(),
  updateFlight: vi.fn(),
  getSwarm: vi.fn(),
  updateSwarm: vi.fn(),
  bumpEpoch: vi.fn(),
  getBlueprint: vi.fn(),
}));

vi.mock("../snapshot/checkpoint.js", () => ({
  checkpointOnTransition: vi.fn(),
}));

vi.mock("../lib/events.js", () => ({
  emitEvent: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { approveFlight } from "./gate.js";
import * as db from "../db.js";

const mockDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("approveFlight", () => {
  it("returns error when flight not found", () => {
    mockDb.getFlight.mockReturnValue(undefined);
    const result = approveFlight("not-found");
    expect(result.success).toBe(false);
  });

  it("returns error when flight is not gated", () => {
    mockDb.getFlight.mockReturnValue({
      id: "f1",
      status: "pending",
      flight_id: "test",
      swarm_id: "s1",
    } as any);
    const result = approveFlight("f1");
    expect(result.success).toBe(false);
    expect((result as any).error).toContain("not gated");
  });

  it("promotes gated flight to pending", () => {
    mockDb.getFlight.mockReturnValue({
      id: "f1",
      status: "gated",
      flight_id: "finalize",
      swarm_id: "s1",
    } as any);
    mockDb.getSwarm.mockReturnValue({
      id: "s1",
      status: "blocked",
    } as any);

    const result = approveFlight("f1", "Approved by user");
    expect(result.success).toBe(true);
    expect(mockDb.updateFlight).toHaveBeenCalledWith("f1", { status: "pending" });
    expect(mockDb.updateSwarm).toHaveBeenCalledWith("s1", { status: "buzzing" });
    expect(mockDb.bumpEpoch).toHaveBeenCalled();
  });

  it("does not unblock swarm if not blocked", () => {
    mockDb.getFlight.mockReturnValue({
      id: "f1",
      status: "gated",
      flight_id: "finalize",
      swarm_id: "s1",
    } as any);
    mockDb.getSwarm.mockReturnValue({
      id: "s1",
      status: "buzzing",
    } as any);

    approveFlight("f1");
    expect(mockDb.updateSwarm).not.toHaveBeenCalled();
  });
});
