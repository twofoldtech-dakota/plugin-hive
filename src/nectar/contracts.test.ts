import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedSwarm, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { validateContracts, checkProducedKeys } from "./contracts.js";
import type { BlueprintSpec } from "../types.js";

describe("Nectar Contracts", () => {
  beforeEach(() => {
    freshDb();
  });

  describe("validateContracts", () => {
    it("returns no issues when no contracts declared", () => {
      const issues = validateContracts(MINIMAL_BLUEPRINT);
      expect(issues).toEqual([]);
    });

    it("returns no issues when contracts satisfied", () => {
      const spec: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        flights: [
          {
            id: "analyze",
            bee: "worker",
            type: "single",
            produces: ["analysis_result"],
            input: "Analyze: {{task}}",
            expects: "ANALYSIS_RESULT: text",
            max_retries: 2,
          },
          {
            id: "implement",
            bee: "worker",
            type: "single",
            requires: ["analysis_result"],
            input: "Implement based on {{analysis_result}}",
            expects: "STATUS: done",
            max_retries: 2,
          },
        ],
      };
      const issues = validateContracts(spec);
      expect(issues).toEqual([]);
    });

    it("warns when required key not produced by earlier flight", () => {
      const spec: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        flights: [
          {
            id: "implement",
            bee: "worker",
            type: "single",
            requires: ["missing_key"],
            input: "Implement: {{task}}",
            expects: "STATUS: done",
            max_retries: 2,
          },
        ],
      };
      const issues = validateContracts(spec);
      expect(issues.length).toBe(1);
      expect(issues[0].type).toBe("warning");
      expect(issues[0].message).toContain("missing_key");
    });

    it("allows system keys without producers", () => {
      const spec: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        flights: [
          {
            id: "work",
            bee: "worker",
            type: "single",
            requires: ["task", "swarm_id"],
            input: "Do: {{task}}",
            expects: "STATUS: done",
            max_retries: 2,
          },
        ],
      };
      const issues = validateContracts(spec);
      expect(issues).toEqual([]);
    });

    it("allows keys from nectar and inputs", () => {
      const spec: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        nectar: { repo_url: "https://github.com" },
        inputs: [{ name: "branch", required: false }],
        flights: [
          {
            id: "work",
            bee: "worker",
            type: "single",
            requires: ["repo_url", "branch"],
            input: "Do: {{task}}",
            expects: "STATUS: done",
            max_retries: 2,
          },
        ],
      };
      const issues = validateContracts(spec);
      expect(issues).toEqual([]);
    });
  });

  describe("checkProducedKeys", () => {
    it("returns empty when all keys present", () => {
      const missing = checkProducedKeys("f1", "s1", ["status"], { status: "done" });
      expect(missing).toEqual([]);
    });

    it("returns missing keys", () => {
      const missing = checkProducedKeys("f1", "s1", ["status", "url"], { status: "done" });
      expect(missing).toEqual(["url"]);
    });
  });
});
