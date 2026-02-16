import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb } from "../test/helpers.js";
import { getConfig, setConfig, isEventEnabled } from "./config.js";
import type { NotificationConfigRecord } from "../types.js";

beforeEach(() => {
  freshDb();
});

describe("getConfig", () => {
  it("returns default config when no config exists", () => {
    const result = getConfig();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.id).toBe("global");
    expect(result.config.default_url).toBeNull();
    expect(result.config.enabled_events).toBeNull();
    expect(result.config.format).toBe("standard");
  });

  it("returns stored config after setConfig", () => {
    setConfig({ url: "https://example.com" });
    const result = getConfig();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.default_url).toBe("https://example.com");
  });
});

describe("setConfig", () => {
  it("updates the URL", () => {
    const result = setConfig({ url: "https://example.com" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.default_url).toBe("https://example.com");
  });

  it("updates just the format", () => {
    const result = setConfig({ format: "slack" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.format).toBe("slack");
  });

  it("updates enabled events", () => {
    const result = setConfig({ events: ["swarm.completed", "swarm.failed"] });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const events = JSON.parse(result.config.enabled_events!);
    expect(events).toEqual(["swarm.completed", "swarm.failed"]);
  });

  it("preserves existing fields when updating a single field", () => {
    setConfig({ url: "https://example.com", format: "discord" });
    const result = setConfig({ format: "slack" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.format).toBe("slack");
    expect(result.config.default_url).toBe("https://example.com");
  });
});

describe("isEventEnabled", () => {
  it("returns true when events include the event type", () => {
    const config: NotificationConfigRecord = {
      id: "global",
      default_url: null,
      enabled_events: JSON.stringify(["swarm.completed"]),
      format: "standard",
      created_at: "",
      updated_at: "",
    };
    expect(isEventEnabled("swarm.completed", config)).toBe(true);
  });

  it("returns false when events do not include the event type", () => {
    const config: NotificationConfigRecord = {
      id: "global",
      default_url: null,
      enabled_events: JSON.stringify(["swarm.completed"]),
      format: "standard",
      created_at: "",
      updated_at: "",
    };
    expect(isEventEnabled("flight.failed", config)).toBe(false);
  });

  it("returns true when enabled_events is null (all events enabled)", () => {
    const config: NotificationConfigRecord = {
      id: "global",
      default_url: null,
      enabled_events: null,
      format: "standard",
      created_at: "",
      updated_at: "",
    };
    expect(isEventEnabled("swarm.completed", config)).toBe(true);
    expect(isEventEnabled("flight.failed", config)).toBe(true);
  });
});
