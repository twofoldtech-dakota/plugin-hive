import type { RetryStrategy } from "../types.js";

/**
 * Compute retry delay in seconds based on retry strategy and current attempt count.
 */
export function computeRetryDelay(strategy: RetryStrategy | null | undefined, retryCount: number): number {
  if (!strategy || strategy.type === "immediate") {
    return 0;
  }

  const base = strategy.delay_seconds ?? 30;

  if (strategy.type === "linear") {
    return base * retryCount;
  }

  if (strategy.type === "exponential") {
    return base * Math.pow(2, retryCount - 1);
  }

  return 0;
}

/**
 * Compute a retry_at datetime string from a delay in seconds.
 * Returns null if delay is 0 (immediate retry).
 */
export function computeRetryAt(delaySeconds: number): string | null {
  if (delaySeconds <= 0) return null;
  const retryAt = new Date(Date.now() + delaySeconds * 1000);
  return retryAt.toISOString().replace("T", " ").slice(0, 19);
}
