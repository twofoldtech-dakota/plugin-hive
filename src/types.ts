// ── Bee Roles ────────────────────────────────────────────────────────
export type BeeRole =
  | "analysis"      // Queen, Scout — read-only analysis
  | "coding"        // Worker — full code editing
  | "verification"  // Inspector — code review
  | "testing"       // Builder — test execution
  | "pr"            // Worker (PR mode) — git operations
  | "scanning";     // Guard — security scanning

// ── Blueprint (workflow definition) ──────────────────────────────────

export interface ChamberConfig {
  base_dir: string;
  files: Record<string, string>;
}

export interface BeeSpec {
  id: string;
  name?: string;
  description?: string;
  role: BeeRole;
  model?: string;
  polling_model?: string;
  timeout_seconds?: number;
  chamber: ChamberConfig;
}

export interface LoopConfig {
  over: string;
  verify_each?: boolean;
  completion: "all_done";
}

export interface FlightSpec {
  id: string;
  bee: string;
  type: "single" | "loop";
  loop?: LoopConfig;
  input: string;
  expects: string;
  max_retries: number;
}

export interface PollingConfig {
  model?: string;
  timeout_seconds?: number;
}

export interface BlueprintSpec {
  id: string;
  name?: string;
  version?: number;
  description?: string;
  polling?: PollingConfig;
  bees: BeeSpec[];
  flights: FlightSpec[];
  nectar?: Record<string, string>;
  notifications?: {
    url?: string;
  };
}

// ── Database Records ─────────────────────────────────────────────────

export type SwarmStatus =
  | "buzzing"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export interface SwarmRecord {
  id: string;
  swarm_number: number;
  blueprint_id: string;
  task: string;
  status: SwarmStatus;
  nectar: string; // JSON string of Record<string, string>
  notify_url: string | null;
  created_at: string;
  updated_at: string;
}

export type FlightStatus =
  | "waiting"
  | "pending"
  | "in_flight"
  | "done"
  | "failed";

export interface FlightRecord {
  id: string;
  swarm_id: string;
  flight_id: string;
  bee_id: string;
  flight_index: number;
  input_template: string;
  expects: string;
  status: FlightStatus;
  output: string | null;
  retry_count: number;
  max_retries: number;
  type: "single" | "loop";
  loop_config: string | null; // JSON string of LoopConfig
  current_cell_id: string | null;
  abandoned_count: number;
  created_at: string;
  updated_at: string;
}

export type CellStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed";

export interface CellRecord {
  id: string;
  swarm_id: string;
  cell_index: number;
  cell_id: string;
  title: string;
  description: string;
  acceptance_criteria: string; // JSON string of string[]
  status: CellStatus;
  output: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface BeekeeperCheckRecord {
  id: string;
  checked_at: string;
  issues_found: number;
  actions_taken: number;
  summary: string;
  details: string | null; // JSON string
}

export interface EventRecord {
  id: string;
  swarm_id: string | null;
  event_type: string;
  payload: string | null; // JSON string
  created_at: string;
}

// ── Blueprint (installed) ────────────────────────────────────────────

export interface BlueprintRecord {
  id: string;
  name: string | null;
  version: number | null;
  spec: string; // JSON string of BlueprintSpec
  installed_at: string;
}

// ── Flight Claim Result ──────────────────────────────────────────────

export interface FlightClaimResult {
  flight_id: string;
  swarm_id: string;
  resolved_input: string;
  expects: string;
  type: "single" | "loop";
  cell?: {
    id: string;
    cell_id: string;
    title: string;
    description: string;
    acceptance_criteria: string[];
  };
}

// ── Event Types ──────────────────────────────────────────────────────

export type HiveEventType =
  | "swarm.started"
  | "swarm.completed"
  | "swarm.failed"
  | "swarm.cancelled"
  | "flight.ready"
  | "flight.claimed"
  | "flight.completed"
  | "flight.failed"
  | "cell.started"
  | "cell.completed"
  | "cell.failed"
  | "beekeeper.check";
