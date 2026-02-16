import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, seedBlueprint, MINIMAL_BLUEPRINT } from "../test/helpers.js";
import { saveTemplate, listSavedTemplates, runTemplate, deleteTemplateByName } from "./templates.js";
import * as db from "../db.js";

describe("Swarm Templates", () => {
  beforeEach(() => {
    freshDb();
    seedBlueprint();
  });

  describe("saveTemplate", () => {
    it("saves a new template", () => {
      const result = saveTemplate("daily-deploy", "test-bp", "Daily deployment", { env: "prod" }, 8);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.result.template.name).toBe("daily-deploy");
      expect(result.result.template.blueprint_id).toBe("test-bp");
      expect(result.result.template.priority).toBe(8);
      expect(result.result.template.description).toBe("Daily deployment");
    });

    it("rejects duplicate template names", () => {
      saveTemplate("daily-deploy", "test-bp");
      const result = saveTemplate("daily-deploy", "test-bp");
      expect(result.success).toBe(false);
    });

    it("rejects non-existent blueprint", () => {
      const result = saveTemplate("test", "nonexistent");
      expect(result.success).toBe(false);
    });

    it("emits template.created event", () => {
      saveTemplate("my-template", "test-bp");
      const events = db.getRecentEvents(10);
      const created = events.find(e => e.event_type === "template.created");
      expect(created).toBeDefined();
    });
  });

  describe("listSavedTemplates", () => {
    it("lists all templates", () => {
      saveTemplate("template-a", "test-bp");
      saveTemplate("template-b", "test-bp");

      const result = listSavedTemplates();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.templates.length).toBe(2);
    });

    it("returns empty list when no templates", () => {
      const result = listSavedTemplates();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.templates.length).toBe(0);
    });
  });

  describe("deleteTemplateByName", () => {
    it("deletes an existing template", () => {
      saveTemplate("to-delete", "test-bp");
      const result = deleteTemplateByName("to-delete");
      expect(result.success).toBe(true);

      const list = listSavedTemplates();
      expect(list.success && list.templates.length).toBe(0);
    });

    it("returns error for non-existent template", () => {
      const result = deleteTemplateByName("nonexistent");
      expect(result.success).toBe(false);
    });

    it("emits template.deleted event", () => {
      saveTemplate("to-delete", "test-bp");
      deleteTemplateByName("to-delete");
      const events = db.getRecentEvents(10);
      const deleted = events.find(e => e.event_type === "template.deleted");
      expect(deleted).toBeDefined();
    });
  });

  describe("runTemplate", () => {
    it("starts a swarm from a template", () => {
      saveTemplate("my-template", "test-bp", "desc", { env: "staging" }, 7);

      const result = runTemplate("my-template", "Build dashboard");
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.result.template_name).toBe("my-template");
      expect(result.result.swarm_number).toBeGreaterThan(0);
    });

    it("increments usage count on run", () => {
      saveTemplate("counter-test", "test-bp");

      runTemplate("counter-test", "Task 1");
      runTemplate("counter-test", "Task 2");

      const template = db.getTemplate("counter-test");
      expect(template!.usage_count).toBe(2);
    });

    it("applies variable overrides", () => {
      saveTemplate("with-vars", "test-bp", undefined, { base: "default" });

      const result = runTemplate("with-vars", "Override test", { base: "overridden" });
      expect(result.success).toBe(true);
    });

    it("applies priority override", () => {
      saveTemplate("with-priority", "test-bp", undefined, undefined, 3);

      const result = runTemplate("with-priority", "Priority test", undefined, 9);
      expect(result.success).toBe(true);
    });

    it("returns error for non-existent template", () => {
      const result = runTemplate("nonexistent", "Task");
      expect(result.success).toBe(false);
    });
  });
});
