import { describe, it, expect } from "vitest";
import { resolveGatePolicy, shouldAutoApprove, isGateExpired, parseGateSpec, serializeGateSpec } from "./gate-policy.js";
import type { GatePolicy } from "../types.js";

describe("Gate Policy", () => {
  describe("resolveGatePolicy", () => {
    it("normalizes string to GatePolicy", () => {
      const policy = resolveGatePolicy("approval");
      expect(policy).toEqual({ type: "approval" });
    });

    it("passes through object form", () => {
      const input: GatePolicy = {
        type: "approval",
        auto_approve_when: "{{status}} == pass",
        timeout_minutes: 30,
        on_timeout: "approve",
      };
      const policy = resolveGatePolicy(input);
      expect(policy).toEqual(input);
    });
  });

  describe("shouldAutoApprove", () => {
    it("returns false when no auto_approve_when", () => {
      const policy: GatePolicy = { type: "approval" };
      expect(shouldAutoApprove(policy, { status: "pass" })).toBe(false);
    });

    it("returns true when condition met", () => {
      const policy: GatePolicy = {
        type: "approval",
        auto_approve_when: "{{test_status}} == pass",
      };
      expect(shouldAutoApprove(policy, { test_status: "pass" })).toBe(true);
    });

    it("returns false when condition not met", () => {
      const policy: GatePolicy = {
        type: "approval",
        auto_approve_when: "{{test_status}} == pass",
      };
      expect(shouldAutoApprove(policy, { test_status: "fail" })).toBe(false);
    });

    it("handles missing nectar keys", () => {
      const policy: GatePolicy = {
        type: "approval",
        auto_approve_when: "{{missing}} == pass",
      };
      expect(shouldAutoApprove(policy, {})).toBe(false);
    });
  });

  describe("isGateExpired", () => {
    it("returns true when past timeout", () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
      expect(isGateExpired(pastDate, 30)).toBe(true);
    });

    it("returns false when within timeout", () => {
      const recentDate = new Date(Date.now() - 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
      expect(isGateExpired(recentDate, 30)).toBe(false);
    });
  });

  describe("parseGateSpec", () => {
    it("parses plain approval string", () => {
      expect(parseGateSpec("approval")).toBe("approval");
    });

    it("parses JSON object", () => {
      const json = JSON.stringify({ type: "approval", auto_approve_when: "{{x}} == y" });
      const result = parseGateSpec(json);
      expect(typeof result).toBe("object");
      expect((result as GatePolicy).auto_approve_when).toBe("{{x}} == y");
    });
  });

  describe("serializeGateSpec", () => {
    it("serializes string as-is", () => {
      expect(serializeGateSpec("approval")).toBe("approval");
    });

    it("serializes object as JSON", () => {
      const policy: GatePolicy = { type: "approval", timeout_minutes: 30 };
      const serialized = serializeGateSpec(policy);
      expect(JSON.parse(serialized)).toEqual(policy);
    });
  });
});
