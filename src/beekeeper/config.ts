import type { BeekeeperConfig } from "../types.js";

export interface ResolvedThresholds {
  stuck_flight_minutes: number;
  stalled_swarm_minutes: number;
  verification_loop_max: number;
  cell_stuck_minutes: number;
}

const DEFAULTS: ResolvedThresholds = {
  stuck_flight_minutes: 35,
  stalled_swarm_minutes: 30,
  verification_loop_max: 3,
  cell_stuck_minutes: 30,
};

/**
 * Merge blueprint-specific beekeeper overrides with system defaults.
 */
export function resolveBeekeeperThresholds(config?: BeekeeperConfig): ResolvedThresholds {
  if (!config) return { ...DEFAULTS };
  return {
    stuck_flight_minutes: config.stuck_flight_minutes ?? DEFAULTS.stuck_flight_minutes,
    stalled_swarm_minutes: config.stalled_swarm_minutes ?? DEFAULTS.stalled_swarm_minutes,
    verification_loop_max: config.verification_loop_max ?? DEFAULTS.verification_loop_max,
    cell_stuck_minutes: config.cell_stuck_minutes ?? DEFAULTS.cell_stuck_minutes,
  };
}
