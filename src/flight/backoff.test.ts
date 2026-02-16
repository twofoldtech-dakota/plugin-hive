import { describe, it, expect } from "vitest";
import { computeRetryDelay, computeRetryAt } from "./backoff.js";

describe("computeRetryDelay", () => {
  it("returns 0 for immediate strategy", () => {
    expect(computeRetryDelay({ type: "immediate" }, 1)).toBe(0);
    expect(computeRetryDelay({ type: "immediate" }, 3)).toBe(0);
  });

  it("returns 0 for null/undefined strategy", () => {
    expect(computeRetryDelay(null, 1)).toBe(0);
    expect(computeRetryDelay(undefined, 1)).toBe(0);
  });

  it("computes linear delay", () => {
    const strategy = { type: "linear" as const, delay_seconds: 30 };
    expect(computeRetryDelay(strategy, 1)).toBe(30);
    expect(computeRetryDelay(strategy, 2)).toBe(60);
    expect(computeRetryDelay(strategy, 3)).toBe(90);
  });

  it("computes exponential delay", () => {
    const strategy = { type: "exponential" as const, delay_seconds: 30 };
    expect(computeRetryDelay(strategy, 1)).toBe(30);  // 30 * 2^0
    expect(computeRetryDelay(strategy, 2)).toBe(60);  // 30 * 2^1
    expect(computeRetryDelay(strategy, 3)).toBe(120); // 30 * 2^2
  });

  it("uses default base of 30 seconds", () => {
    expect(computeRetryDelay({ type: "linear" }, 2)).toBe(60);
    expect(computeRetryDelay({ type: "exponential" }, 2)).toBe(60);
  });
});

describe("computeRetryAt", () => {
  it("returns null for zero delay", () => {
    expect(computeRetryAt(0)).toBeNull();
  });

  it("returns a future datetime string for positive delay", () => {
    const result = computeRetryAt(60);
    expect(result).not.toBeNull();
    // Should be in YYYY-MM-DD HH:MM:SS format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // Should be in the future
    const retryTime = new Date(result!.replace(" ", "T") + "Z");
    expect(retryTime.getTime()).toBeGreaterThan(Date.now() - 1000);
  });
});
