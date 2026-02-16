import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "../test/helpers.js";
import { getGlobalConfig, setGlobalConfig, getConfigNumber, getConfigBoolean } from "./global.js";

describe("Global Config", () => {
  beforeEach(() => {
    freshDb();
  });

  it("returns all default config entries", () => {
    const result = getGlobalConfig();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.length).toBeGreaterThanOrEqual(5);
    const keys = result.config.map(c => c.key);
    expect(keys).toContain("max_concurrent_swarms");
    expect(keys).toContain("retention_days");
    expect(keys).toContain("auto_archive");
  });

  it("gets a specific config key", () => {
    const result = getGlobalConfig("max_concurrent_swarms");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.length).toBe(1);
    expect(result.config[0].value).toBe("5");
  });

  it("errors on unknown key", () => {
    const result = getGlobalConfig("nonexistent_key");
    expect(result.success).toBe(false);
  });

  it("sets a number config", () => {
    const result = setGlobalConfig("max_concurrent_swarms", "10");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toBe("10");

    const check = getGlobalConfig("max_concurrent_swarms");
    if (check.success) {
      expect(check.config[0].value).toBe("10");
    }
  });

  it("sets a boolean config", () => {
    const result = setGlobalConfig("auto_archive", "true");
    expect(result.success).toBe(true);
  });

  it("rejects invalid number", () => {
    const result = setGlobalConfig("max_concurrent_swarms", "abc");
    expect(result.success).toBe(false);
  });

  it("rejects invalid boolean", () => {
    const result = setGlobalConfig("auto_archive", "yes");
    expect(result.success).toBe(false);
  });

  it("rejects unknown key for set", () => {
    const result = setGlobalConfig("unknown_key", "42");
    expect(result.success).toBe(false);
  });

  it("getConfigNumber returns number", () => {
    expect(getConfigNumber("max_concurrent_swarms", 3)).toBe(5);
  });

  it("getConfigBoolean returns boolean", () => {
    expect(getConfigBoolean("auto_archive", true)).toBe(false);
  });
});
