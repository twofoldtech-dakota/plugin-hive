import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT, DAG_BLUEPRINT } from "../test/helpers.js";
import { injectFlight, skipFlight } from "./dynamic.js";
import * as db from "../db.js";

describe("Dynamic Pipeline", () => {
  beforeEach(() => {
    freshDb();
  });

  describe("injectFlight", () => {
    it("injects a flight after a specified flight", () => {
      const { swarm, flights } = seedSwarm();

      const result = injectFlight(
        swarm.id,
        flights[0].flight_id,
        "test-bp_worker",
        "Do extra work: {{task}}",
        "STATUS: done",
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.result.flight_id).toContain("injected-");
      expect(result.result.message).toContain("injected");

      // Verify the flight exists in DB
      const allFlights = db.getFlightsForSwarm(swarm.id);
      expect(allFlights.length).toBe(2);
    });

    it("sets injected flight to pending when after-flight is done", () => {
      const { swarm, flights } = seedSwarm();
      db.updateFlight(flights[0].id, { status: "done", output: "STATUS: done" });

      const result = injectFlight(
        swarm.id,
        flights[0].flight_id,
        "test-bp_worker",
        "Extra work",
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const injected = db.getFlight(result.result.flight_uuid);
      expect(injected!.status).toBe("pending");
    });

    it("sets injected flight to waiting when after-flight is not done", () => {
      const { swarm, flights } = seedSwarm();

      const result = injectFlight(
        swarm.id,
        flights[0].flight_id,
        "test-bp_worker",
        "Extra work",
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const injected = db.getFlight(result.result.flight_uuid);
      expect(injected!.status).toBe("waiting");
    });

    it("rejects injection into completed swarm", () => {
      const { swarm, flights } = seedSwarm();
      db.updateSwarm(swarm.id, { status: "completed" });

      const result = injectFlight(swarm.id, flights[0].flight_id, "bee", "input");
      expect(result.success).toBe(false);
    });

    it("rejects injection with non-existent after-flight", () => {
      const { swarm } = seedSwarm();
      const result = injectFlight(swarm.id, "nonexistent", "bee", "input");
      expect(result.success).toBe(false);
    });

    it("emits flight.injected event", () => {
      const { swarm, flights } = seedSwarm();
      injectFlight(swarm.id, flights[0].flight_id, "test-bp_worker", "Extra work");

      const events = db.getEventsForSwarm(swarm.id);
      const injected = events.find(e => e.event_type === "flight.injected");
      expect(injected).toBeDefined();
    });
  });

  describe("skipFlight", () => {
    it("skips a pending flight", () => {
      const { swarm, flights } = seedSwarm();

      const result = skipFlight(flights[0].id, "Not needed");
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.result.message).toContain("skipped");

      const updated = db.getFlight(flights[0].id)!;
      expect(updated.status).toBe("done");
      expect(updated.output).toBe("SKIPPED: Not needed");
    });

    it("skips a waiting flight", () => {
      const { swarm, flights } = seedSwarm(DAG_BLUEPRINT);
      const waitingFlight = flights.find(f => f.status === "waiting");
      expect(waitingFlight).toBeDefined();

      const result = skipFlight(waitingFlight!.id);
      expect(result.success).toBe(true);

      const updated = db.getFlight(waitingFlight!.id)!;
      expect(updated.status).toBe("done");
      expect(updated.output).toBe("SKIPPED: manually skipped");
    });

    it("rejects skipping in_flight flights", () => {
      const { flights } = seedSwarm();
      db.updateFlight(flights[0].id, { status: "in_flight" });

      const result = skipFlight(flights[0].id);
      expect(result.success).toBe(false);
    });

    it("rejects skipping done flights", () => {
      const { flights } = seedSwarm();
      db.updateFlight(flights[0].id, { status: "done" });

      const result = skipFlight(flights[0].id);
      expect(result.success).toBe(false);
    });

    it("emits flight.skipped_manual event", () => {
      const { swarm, flights } = seedSwarm();
      skipFlight(flights[0].id, "User requested");

      const events = db.getEventsForSwarm(swarm.id);
      const skipped = events.find(e => e.event_type === "flight.skipped_manual");
      expect(skipped).toBeDefined();
    });

    it("advances pipeline after skipping", () => {
      const { swarm, flights } = seedSwarm();
      skipFlight(flights[0].id);

      // Since the only flight was skipped, swarm should be completed
      const updated = db.getSwarm(swarm.id)!;
      expect(updated.status).toBe("completed");
    });
  });
});
