import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT, DAG_BLUEPRINT } from "../test/helpers.js";
import * as db from "../db.js";
import { generateSwarmReport } from "./generate.js";

describe("Swarm Report", () => {
  beforeEach(() => {
    freshDb();
  });

  it("generates a report for a completed swarm", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT, "Report test");
    db.updateFlight(flights[0].id, { status: "done", output: "STATUS: done" });
    db.updateSwarm(swarm.id, { status: "completed" });

    const result = generateSwarmReport(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.report.swarm.task).toBe("Report test");
    expect(result.report.summary.total_flights).toBe(1);
    expect(result.report.summary.completed_flights).toBe(1);
    expect(result.markdown).toContain("# Swarm Report");
    expect(result.markdown).toContain("Report test");
  });

  it("generates a report for a DAG swarm", () => {
    const { swarm, flights } = seedSwarm(DAG_BLUEPRINT, "DAG report test");

    // Complete all flights
    for (const f of flights) {
      db.updateFlight(f.id, { status: "done", output: "STATUS: done" });
    }
    db.updateSwarm(swarm.id, { status: "completed" });

    const result = generateSwarmReport(swarm.id);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.report.summary.total_flights).toBe(5);
    expect(result.report.flight_timeline.length).toBe(5);
  });

  it("errors on nonexistent swarm", () => {
    const result = generateSwarmReport("nonexistent");
    expect(result.success).toBe(false);
  });

  it("includes nectar in report", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT, "Nectar test");
    // Update nectar
    db.updateSwarm(swarm.id, {
      nectar: JSON.stringify({ task: "Nectar test", status: "done" }),
      status: "completed",
    });
    db.updateFlight(flights[0].id, { status: "done", output: "STATUS: done" });

    const result = generateSwarmReport(swarm.id);
    if (!result.success) return;

    expect(result.report.nectar.task).toBe("Nectar test");
    expect(result.markdown).toContain("Nectar");
  });

  it("markdown includes tables", () => {
    const { swarm, flights } = seedSwarm(MINIMAL_BLUEPRINT, "Table test");
    db.updateFlight(flights[0].id, { status: "done", output: "STATUS: done" });
    db.updateSwarm(swarm.id, { status: "completed" });

    const result = generateSwarmReport(swarm.id);
    if (!result.success) return;

    expect(result.markdown).toContain("| Flight |");
    expect(result.markdown).toContain("| Metric |");
  });
});
