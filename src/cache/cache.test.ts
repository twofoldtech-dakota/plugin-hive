import { describe, it, expect, beforeEach } from "vitest";
import { freshDb } from "../test/helpers.js";
import { computeInputHash, getCached, cacheResult, getCacheStatus, clearCache } from "./cache.js";
import * as db from "../db.js";

describe("Cache", () => {
  beforeEach(() => {
    freshDb();
  });

  describe("computeInputHash", () => {
    it("returns consistent SHA-256 hash", () => {
      const hash1 = computeInputHash("Implement: Build auth");
      const hash2 = computeInputHash("Implement: Build auth");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("returns different hash for different inputs", () => {
      const hash1 = computeInputHash("Implement: Build auth");
      const hash2 = computeInputHash("Implement: Build dashboard");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("getCached", () => {
    it("returns null when cache is disabled", () => {
      const result = getCached("bp", "flight", "hash");
      expect(result).toBeNull();
    });

    it("returns cached entry when cache is enabled", () => {
      db.setHiveConfig("cache_enabled", "true");
      cacheResult("bp", "flight", "abc123", "STATUS: done", null, 24);

      const result = getCached("bp", "flight", "abc123");
      expect(result).not.toBeNull();
      expect(result!.output).toBe("STATUS: done");
    });

    it("returns null for cache miss", () => {
      db.setHiveConfig("cache_enabled", "true");
      const result = getCached("bp", "flight", "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("cacheResult", () => {
    it("stores a cache entry with TTL", () => {
      db.setHiveConfig("cache_enabled", "true");
      cacheResult("bp1", "do-work", "hash1", "RESULT: ok", ["result"], 48);

      const stats = db.getCacheStats();
      expect(stats.entries).toBe(1);
    });

    it("does nothing when cache is disabled", () => {
      cacheResult("bp1", "do-work", "hash1", "RESULT: ok", null, 24);
      const stats = db.getCacheStats();
      expect(stats.entries).toBe(0);
    });
  });

  describe("getCacheStatus", () => {
    it("returns cache statistics", () => {
      const status = getCacheStatus();
      expect(status.enabled).toBe(false);
      expect(status.entries).toBe(0);
      expect(status.total_hits).toBe(0);
      expect(status.ttl_hours).toBe(24);
    });

    it("tracks hit counts", () => {
      db.setHiveConfig("cache_enabled", "true");
      cacheResult("bp", "flight", "hash", "output", null, 24);
      getCached("bp", "flight", "hash");
      getCached("bp", "flight", "hash");

      const status = getCacheStatus();
      expect(status.total_hits).toBe(2);
    });
  });

  describe("clearCache", () => {
    it("clears all entries", () => {
      db.setHiveConfig("cache_enabled", "true");
      cacheResult("bp1", "f1", "h1", "out1", null, 24);
      cacheResult("bp2", "f2", "h2", "out2", null, 24);

      const result = clearCache();
      expect(result.deleted).toBe(2);
      expect(result.scope).toBe("all");
    });

    it("clears by blueprint ID", () => {
      db.setHiveConfig("cache_enabled", "true");
      cacheResult("bp1", "f1", "h1", "out1", null, 24);
      cacheResult("bp2", "f2", "h2", "out2", null, 24);

      const result = clearCache("bp1");
      expect(result.deleted).toBe(1);
      expect(result.scope).toBe("bp1");
    });

    it("clears by blueprint + flight ID", () => {
      db.setHiveConfig("cache_enabled", "true");
      cacheResult("bp1", "f1", "h1", "out1", null, 24);
      cacheResult("bp1", "f2", "h2", "out2", null, 24);

      const result = clearCache("bp1", "f1");
      expect(result.deleted).toBe(1);
      expect(result.scope).toBe("bp1/f1");
    });
  });
});
