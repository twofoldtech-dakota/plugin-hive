import * as db from "../db.js";
import { logger } from "../lib/logger.js";
import type { BeeReadiness, BlueprintSpec } from "../types.js";

// ── Types ───────────────────────────────────────────────────────────

interface RegisteredSwarm {
  swarmId: string;
  blueprintSpec: BlueprintSpec;
  beeIds: string[]; // fully qualified: blueprintId_beeId
}

// ── Waggle Dance Scheduler ──────────────────────────────────────────

/**
 * In-memory scheduler that tracks bee readiness across registered swarms.
 * The MCP server is reactive — this scheduler maintains state that the
 * coordinator queries via the `hive_pollinate` tool.
 */
export class WaggleDanceScheduler {
  private swarms = new Map<string, RegisteredSwarm>();
  private readiness = new Map<string, BeeReadiness>(); // key: swarmId:beeId

  /**
   * Register a swarm for scheduling. Extracts all bees from the blueprint.
   */
  registerSwarm(swarmId: string, blueprintSpec: BlueprintSpec): void {
    const beeIds = blueprintSpec.bees.map(b => `${blueprintSpec.id}_${b.id}`);
    this.swarms.set(swarmId, { swarmId, blueprintSpec, beeIds });

    // Initialize readiness entries
    for (const beeId of beeIds) {
      this.readiness.set(`${swarmId}:${beeId}`, {
        swarmId,
        beeId,
        pendingCount: 0,
      });
    }

    logger.info("Scheduler: registered swarm", { swarmId, bees: beeIds.length });
  }

  /**
   * Unregister a swarm when it completes/fails/cancels.
   */
  unregisterSwarm(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    for (const beeId of swarm.beeIds) {
      this.readiness.delete(`${swarmId}:${beeId}`);
    }
    this.swarms.delete(swarmId);

    logger.info("Scheduler: unregistered swarm", { swarmId });
  }

  /**
   * Refresh readiness by peeking all registered bees.
   * Uses a single batch COUNT query via db.peekFlightsForBees.
   */
  refreshReadiness(): void {
    const beeIds = Array.from(this.readiness.values()).map(e => e.beeId);
    if (beeIds.length === 0) return;

    const counts = db.peekFlightsForBees(beeIds);
    for (const [_key, entry] of this.readiness) {
      entry.pendingCount = counts.get(entry.beeId) ?? 0;
    }
  }

  /**
   * Return bees that have pending flights.
   */
  getBeesWithWork(): BeeReadiness[] {
    const result: BeeReadiness[] = [];
    for (const entry of this.readiness.values()) {
      if (entry.pendingCount > 0) {
        result.push({ ...entry });
      }
    }
    return result;
  }

  /**
   * Get the blueprint spec for a registered swarm.
   */
  getBlueprintSpec(swarmId: string): BlueprintSpec | undefined {
    return this.swarms.get(swarmId)?.blueprintSpec;
  }

  /**
   * Check if a swarm is registered.
   */
  isRegistered(swarmId: string): boolean {
    return this.swarms.has(swarmId);
  }

  /**
   * Get all registered swarm IDs.
   */
  getRegisteredSwarmIds(): string[] {
    return Array.from(this.swarms.keys());
  }
}

// ── Singleton ───────────────────────────────────────────────────────

export const scheduler = new WaggleDanceScheduler();
