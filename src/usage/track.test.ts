import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm } from "../test/helpers.js";
import * as db from "../db.js";
import { trackUsage } from "./track.js";

beforeEach(() => {
  process.env.HIVE_DATA_DIR = "/tmp/hive-test-track";
  freshDb();
});

describe("trackUsage", () => {
  it("parses explicit TOKEN_USAGE from output", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];

    const output = `STATUS: done\nTOKEN_USAGE: {"input": 1000, "output": 500}\nFILES_CHANGED: foo.ts`;
    trackUsage(flight.id, swarm.id, "test-bp_worker", output);

    const usage = db.getUsageForFlight(flight.id);
    expect(usage).toBeDefined();
    expect(usage!.input_tokens).toBe(1000);
    expect(usage!.output_tokens).toBe(500);
    expect(usage!.estimated).toBe(0);
  });

  it("estimates tokens when no TOKEN_USAGE present", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];

    const output = "STATUS: done\nFILES_CHANGED: foo.ts";
    trackUsage(flight.id, swarm.id, "test-bp_worker", output);

    const usage = db.getUsageForFlight(flight.id);
    expect(usage).toBeDefined();
    expect(usage!.estimated).toBe(1);
    expect(usage!.output_tokens).toBeGreaterThan(0);
    expect(usage!.input_tokens).toBeGreaterThan(0);
  });

  it("falls back to estimation on malformed TOKEN_USAGE", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];

    const output = "TOKEN_USAGE: {invalid json}\nSTATUS: done";
    trackUsage(flight.id, swarm.id, "test-bp_worker", output);

    const usage = db.getUsageForFlight(flight.id);
    expect(usage).toBeDefined();
    expect(usage!.estimated).toBe(1);
  });

  it("handles TOKEN_USAGE with only output field", () => {
    const { swarm, flights } = seedSwarm();
    const flight = flights[0];

    const output = `TOKEN_USAGE: {"output": 200}`;
    trackUsage(flight.id, swarm.id, "test-bp_worker", output);

    const usage = db.getUsageForFlight(flight.id);
    expect(usage).toBeDefined();
    expect(usage!.input_tokens).toBe(0);
    expect(usage!.output_tokens).toBe(200);
    expect(usage!.estimated).toBe(0);
  });
});
