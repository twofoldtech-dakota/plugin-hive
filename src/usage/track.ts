import * as db from "../db.js";
import { logger } from "../lib/logger.js";

/**
 * Parse TOKEN_USAGE from flight output and record usage.
 * Expected format: TOKEN_USAGE: {"input": N, "output": N}
 * Falls back to estimation from output length.
 */
export function trackUsage(
  flightId: string,
  swarmId: string,
  beeId: string,
  output: string,
): void {
  const match = output.match(/^TOKEN_USAGE:\s*(\{.+\})\s*$/m);

  if (match) {
    try {
      const parsed = JSON.parse(match[1]) as { input?: number; output?: number };
      const inputTokens = parsed.input ?? 0;
      const outputTokens = parsed.output ?? 0;
      db.insertUsage(flightId, swarmId, beeId, inputTokens, outputTokens, false);
      logger.info("Token usage recorded", { flightId, inputTokens, outputTokens });
      return;
    } catch {
      logger.warn("Failed to parse TOKEN_USAGE", { flightId });
    }
  }

  // Fallback: estimate from output length (~4 chars per token)
  const estimatedOutput = Math.ceil(output.length / 4);
  const estimatedInput = Math.ceil(estimatedOutput * 2); // rough estimate
  db.insertUsage(flightId, swarmId, beeId, estimatedInput, estimatedOutput, true);
  logger.info("Token usage estimated", { flightId, estimatedInput, estimatedOutput });
}
