import { describe, it, expect } from "vitest";
import { evaluateWhen } from "./when.js";

describe("evaluateWhen", () => {
  describe("truthiness", () => {
    it("returns true when key exists and is non-empty", () => {
      expect(evaluateWhen("{{files_changed}}", { files_changed: "src/foo.ts" })).toBe(true);
    });

    it("returns false when key is missing", () => {
      expect(evaluateWhen("{{files_changed}}", {})).toBe(false);
    });

    it("returns false when key is empty string", () => {
      expect(evaluateWhen("{{files_changed}}", { files_changed: "" })).toBe(false);
    });
  });

  describe("equality", () => {
    it("returns true when values match", () => {
      expect(evaluateWhen("{{status}} == pass", { status: "pass" })).toBe(true);
    });

    it("returns false when values differ", () => {
      expect(evaluateWhen("{{status}} == pass", { status: "fail" })).toBe(false);
    });

    it("returns false when key is missing", () => {
      expect(evaluateWhen("{{status}} == pass", {})).toBe(false);
    });
  });

  describe("inequality", () => {
    it("returns true when values differ", () => {
      expect(evaluateWhen("{{status}} != fail", { status: "pass" })).toBe(true);
    });

    it("returns false when values match", () => {
      expect(evaluateWhen("{{status}} != fail", { status: "fail" })).toBe(false);
    });

    it("returns true when key is missing (empty != value)", () => {
      expect(evaluateWhen("{{status}} != fail", {})).toBe(true);
    });
  });
});
