import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { resumeSwarm } from "./resume.js";
import type { BlueprintSpec } from "../types.js";

beforeEach(() => {
  freshDb();
});

describe("resumeSwarm", () => {
  it("returns error for nonexistent swarm", () => {
    const result = resumeSwarm("nonexistent");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("rejects resuming a buzzing swarm", () => {
    const { swarm } = seedSwarm();
    const result = resumeSwarm(swarm.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("buzzing");
    }
  });

  it("resumes a failed swarm", () => {
    const { swarm, flights } = seedSwarm();
    db.updateSwarm(swarm.id, { status: "failed" });
    db.updateFlight(flights[0].id, { status: "failed" });

    const result = resumeSwarm(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resetFlights).toBe(1);
    }

    expect(db.getSwarm(swarm.id)!.status).toBe("buzzing");
    expect(db.getFlight(flights[0].id)!.status).toBe("pending");
    expect(db.getFlight(flights[0].id)!.retry_count).toBe(0);
  });

  it("resets failed cells", () => {
    const { swarm } = seedSwarm();
    const cell = db.insertCell(swarm.id, 0, "cell-1", "Title", "Desc", []);
    db.updateCell(cell.id, { status: "failed" });
    db.updateSwarm(swarm.id, { status: "failed" });

    const result = resumeSwarm(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resetCells).toBe(1);
    }

    expect(db.getCell(cell.id)!.status).toBe("pending");
    expect(db.getCell(cell.id)!.retry_count).toBe(0);
  });

  it("does not reset non-failed flights", () => {
    const bp: BlueprintSpec = {
      id: "two-flight",
      bees: [{ id: "worker", role: "coding", chamber: { base_dir: "w", files: {} } }],
      flights: [
        { id: "f1", bee: "worker", type: "single", input: "First", expects: "done", max_retries: 2 },
        { id: "f2", bee: "worker", type: "single", input: "Second", expects: "done", max_retries: 2 },
      ],
    };
    const { swarm, flights } = seedSwarm(bp);
    db.updateFlight(flights[0].id, { status: "done" });
    db.updateFlight(flights[1].id, { status: "failed" });
    db.updateSwarm(swarm.id, { status: "failed" });

    const result = resumeSwarm(swarm.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resetFlights).toBe(1); // only f2 was failed
    }

    // f1 stays done
    expect(db.getFlight(flights[0].id)!.status).toBe("done");
    // f2 is reset to pending
    expect(db.getFlight(flights[1].id)!.status).toBe("pending");
  });

  it("emits swarm.resumed event", () => {
    const { swarm, flights } = seedSwarm();
    db.updateSwarm(swarm.id, { status: "failed" });
    db.updateFlight(flights[0].id, { status: "failed" });

    resumeSwarm(swarm.id);

    const events = db.getEventsForSwarm(swarm.id);
    const resumeEvents = events.filter(e => e.event_type === "swarm.resumed");
    expect(resumeEvents.length).toBeGreaterThanOrEqual(1);
  });
});
