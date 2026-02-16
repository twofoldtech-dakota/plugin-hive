import { evaluateWhen } from "./when.js";
import type { GatePolicy, GateSpec } from "../types.js";

/**
 * Normalize a gate spec (string or object) into a GatePolicy.
 */
export function resolveGatePolicy(gate: GateSpec): GatePolicy {
  if (typeof gate === "string") {
    return { type: gate };
  }
  return gate;
}

/**
 * Check if a gate should auto-approve based on its policy and current nectar.
 */
export function shouldAutoApprove(policy: GatePolicy, nectar: Record<string, string>): boolean {
  if (!policy.auto_approve_when) return false;
  return evaluateWhen(policy.auto_approve_when, nectar);
}

/**
 * Check if a gated flight has exceeded its timeout.
 */
export function isGateExpired(gatedAt: string, timeoutMinutes: number): boolean {
  const gatedTime = new Date(gatedAt.replace(" ", "T") + "Z").getTime();
  const now = Date.now();
  const elapsedMinutes = (now - gatedTime) / (1000 * 60);
  return elapsedMinutes >= timeoutMinutes;
}

/**
 * Parse a gate field from DB (could be JSON object or plain string).
 */
export function parseGateSpec(gate: string): GateSpec {
  if (gate === "approval") return "approval";
  try {
    const parsed = JSON.parse(gate);
    if (typeof parsed === "object" && parsed.type) {
      return parsed as GatePolicy;
    }
  } catch {
    // Not JSON — treat as string
  }
  return gate as GateSpec;
}

/**
 * Serialize a GateSpec for DB storage.
 */
export function serializeGateSpec(gate: GateSpec): string {
  if (typeof gate === "string") return gate;
  return JSON.stringify(gate);
}
