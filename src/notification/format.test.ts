import { describe, it, expect, beforeEach } from "vitest";
import * as db from "../db.js";
import { freshDb } from "../test/helpers.js";
import { formatPayload } from "./format.js";
import type { EventRecord } from "../types.js";

beforeEach(() => {
  freshDb();
});

const event: EventRecord = {
  id: "evt-1",
  event_type: "swarm.completed",
  swarm_id: "swarm-abc",
  payload: JSON.stringify({ reason: "all_done" }),
  created_at: "2026-01-01 00:00:00",
};

describe("formatPayload", () => {
  describe("standard format", () => {
    it("returns event_type, swarm_id, payload, and timestamp", () => {
      const result = formatPayload(event, "standard");
      expect(result.event_type).toBe("swarm.completed");
      expect(result.swarm_id).toBe("swarm-abc");
      expect(result.payload).toEqual({ reason: "all_done" });
      expect(result.timestamp).toBe("2026-01-01 00:00:00");
    });

    it("returns null payload when event has no payload", () => {
      const noPayload: EventRecord = { ...event, payload: null };
      const result = formatPayload(noPayload, "standard");
      expect(result.payload).toBeNull();
    });
  });

  describe("slack format", () => {
    it("returns text and blocks with mrkdwn", () => {
      const result = formatPayload(event, "slack");
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe("string");
      expect((result.text as string)).toContain("swarm.completed");

      const blocks = result.blocks as Array<Record<string, unknown>>;
      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);

      const section = blocks[0] as { type: string; text: { type: string; text: string } };
      expect(section.type).toBe("section");
      expect(section.text.type).toBe("mrkdwn");
      expect(section.text.text).toContain("reason");
    });

    it("includes swarm_id snippet in text", () => {
      const result = formatPayload(event, "slack");
      // swarm_id is sliced to first 8 chars
      expect((result.text as string)).toContain("swarm-ab");
    });
  });

  describe("discord format", () => {
    it("returns content and embeds with color", () => {
      const result = formatPayload(event, "discord");
      expect(result.content).toBeDefined();
      expect((result.content as string)).toContain("swarm.completed");

      const embeds = result.embeds as Array<Record<string, unknown>>;
      expect(embeds).toBeDefined();
      expect(embeds.length).toBeGreaterThan(0);

      const embed = embeds[0];
      expect(embed.title).toBe("swarm.completed");
      expect(embed.color).toBe(0x00ff00);
      expect(embed.timestamp).toBe("2026-01-01 00:00:00");
    });

    it("includes payload fields in embed description", () => {
      const result = formatPayload(event, "discord");
      const embeds = result.embeds as Array<Record<string, unknown>>;
      expect((embeds[0].description as string)).toContain("reason");
      expect((embeds[0].description as string)).toContain("all_done");
    });

    it("uses red color for swarm.failed events", () => {
      const failedEvent: EventRecord = { ...event, event_type: "swarm.failed" };
      const result = formatPayload(failedEvent, "discord");
      const embeds = result.embeds as Array<Record<string, unknown>>;
      expect(embeds[0].color).toBe(0xff0000);
    });

    it("uses default color for unknown event types", () => {
      const unknownEvent: EventRecord = { ...event, event_type: "custom.event" };
      const result = formatPayload(unknownEvent, "discord");
      const embeds = result.embeds as Array<Record<string, unknown>>;
      expect(embeds[0].color).toBe(0x0099ff);
    });

    it("shows 'No details' when payload is null", () => {
      const noPayload: EventRecord = { ...event, payload: null };
      const result = formatPayload(noPayload, "discord");
      const embeds = result.embeds as Array<Record<string, unknown>>;
      expect(embeds[0].description).toBe("No details");
    });
  });
});
