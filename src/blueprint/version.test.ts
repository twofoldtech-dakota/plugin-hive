import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { recordVersion, computeDiff, getBlueprintHistory, diffBlueprintVersions } from "./version.js";
import * as db from "../db.js";
import type { BlueprintSpec } from "../types.js";

describe("Blueprint Versioning", () => {
  beforeEach(() => {
    freshDb();
  });

  describe("recordVersion", () => {
    it("records initial version with summary", () => {
      seedBlueprint();
      const record = recordVersion("test-bp", MINIMAL_BLUEPRINT);

      expect(record.blueprint_id).toBe("test-bp");
      expect(record.version_number).toBe(1);
      expect(record.changes_summary).toBe("Initial version");
    });

    it("records subsequent version with diff summary", () => {
      seedBlueprint();
      recordVersion("test-bp", MINIMAL_BLUEPRINT);

      const modified: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        bees: [
          ...MINIMAL_BLUEPRINT.bees,
          { id: "inspector", role: "verification", chamber: { base_dir: "inspector", files: {} } },
        ],
      };
      const record = recordVersion("test-bp", modified);

      expect(record.version_number).toBe(2);
      expect(record.changes_summary).toContain("+1 bee(s)");
    });

    it("emits blueprint.versioned event", () => {
      seedBlueprint();
      recordVersion("test-bp", MINIMAL_BLUEPRINT);

      const events = db.getRecentEvents(10);
      const versioned = events.find(e => e.event_type === "blueprint.versioned");
      expect(versioned).toBeDefined();
    });
  });

  describe("computeDiff", () => {
    it("detects added bees", () => {
      const modified: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        bees: [
          ...MINIMAL_BLUEPRINT.bees,
          { id: "inspector", role: "verification", chamber: { base_dir: "inspector", files: {} } },
        ],
      };
      const diff = computeDiff(MINIMAL_BLUEPRINT, modified);
      expect(diff.bees_added).toEqual(["inspector"]);
      expect(diff.bees_removed).toEqual([]);
    });

    it("detects removed flights", () => {
      const modified: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        flights: [],
      };
      const diff = computeDiff(MINIMAL_BLUEPRINT, modified);
      expect(diff.flights_removed).toEqual(["do-work"]);
    });

    it("detects changed bees", () => {
      const modified: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        bees: [
          { ...MINIMAL_BLUEPRINT.bees[0], timeout_seconds: 600 },
        ],
      };
      const diff = computeDiff(MINIMAL_BLUEPRINT, modified);
      expect(diff.bees_changed).toEqual(["worker"]);
    });

    it("detects other changes", () => {
      const modified: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        description: "New description",
      };
      const diff = computeDiff(MINIMAL_BLUEPRINT, modified);
      expect(diff.other_changes).toContain("description changed");
    });
  });

  describe("getBlueprintHistory", () => {
    it("returns version timeline", () => {
      seedBlueprint();
      recordVersion("test-bp", MINIMAL_BLUEPRINT);
      recordVersion("test-bp", { ...MINIMAL_BLUEPRINT, version: 2 });

      const result = getBlueprintHistory("test-bp");
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.versions.length).toBe(2);
      expect(result.versions[0].version_number).toBe(1);
      expect(result.versions[1].version_number).toBe(2);
    });

    it("returns error for unknown blueprint", () => {
      const result = getBlueprintHistory("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  describe("diffBlueprintVersions", () => {
    it("diffs two versions", () => {
      seedBlueprint();
      recordVersion("test-bp", MINIMAL_BLUEPRINT);

      const modified: BlueprintSpec = {
        ...MINIMAL_BLUEPRINT,
        bees: [
          ...MINIMAL_BLUEPRINT.bees,
          { id: "inspector", role: "verification", chamber: { base_dir: "inspector", files: {} } },
        ],
      };
      recordVersion("test-bp", modified);

      const result = diffBlueprintVersions("test-bp");
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.diff.from_version).toBe(1);
      expect(result.diff.to_version).toBe(2);
      expect(result.diff.bees_added).toEqual(["inspector"]);
    });

    it("returns error with fewer than 2 versions", () => {
      seedBlueprint();
      recordVersion("test-bp", MINIMAL_BLUEPRINT);

      const result = diffBlueprintVersions("test-bp");
      expect(result.success).toBe(false);
    });
  });
});
