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
  verify_flight?: string; // references inspector flight ID template
  completion: "all_done";
}

export interface RetryStrategy {
  type: "immediate" | "linear" | "exponential";
  delay_seconds?: number;
}

export interface FlightSpec {
  id: string;
  bee: string;
  type: "single" | "loop";
  loop?: LoopConfig;
  depends_on?: string[];
  when?: string;
  gate?: "approval";
  retry_strategy?: RetryStrategy;
  input: string;
  expects: string;
  max_retries: number;
}

export interface InputSpec {
  name: string;
  required?: boolean;
  default?: string;
  description?: string;
}

export interface BeekeeperConfig {
  stuck_flight_minutes?: number;
  stalled_swarm_minutes?: number;
  verification_loop_max?: number;
  cell_stuck_minutes?: number;
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
  inputs?: InputSpec[];
  beekeeper?: BeekeeperConfig;
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
  | "failed"
  | "gated";

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
  verify_meta: string | null; // JSON string for verification flight metadata
  depends_on: string | null; // JSON string of string[] (DAG flight IDs)
  when_clause: string | null;
  gate: string | null; // "approval" or null
  retry_at: string | null;
  retry_strategy: string | null; // JSON string of RetryStrategy
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CellStatus =
  | "pending"
  | "in_progress"
  | "verifying"
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
  started_at: string | null;
  completed_at: string | null;
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
  | "swarm.resumed"
  | "flight.ready"
  | "flight.claimed"
  | "flight.completed"
  | "flight.failed"
  | "flight.gated"
  | "flight.skipped"
  | "flight.inspector_created"
  | "cell.started"
  | "cell.completed"
  | "cell.verifying"
  | "cell.failed"
  | "beekeeper.check";

// ── Spawn Request (from pollinator) ─────────────────────────────────

export interface SpawnRequest {
  swarmId: string;
  beeId: string;
  flightId: string;
  flightDescription?: string;
  prompt: string;
  model: string;
  tools: string[];
  disallowedTools: string[];
  maxTurns: number;
  cell?: {
    id: string;
    cellId: string;
    title: string;
  };
}

// ── Pollinate Result ────────────────────────────────────────────────

export interface PollinateResult {
  spawns: SpawnRequest[];
  beesChecked: number;
  beesWithWork: number;
}

// ── Bee Readiness (scheduler) ───────────────────────────────────────

export interface BeeReadiness {
  swarmId: string;
  beeId: string;
  pendingCount: number;
}

// ── Advance Result ──────────────────────────────────────────────────

export interface AdvanceResult {
  action: "completed" | "advanced" | "none";
  advancedFlights?: string[];
}

// ── Beekeeper ────────────────────────────────────────────────────────

export interface CheckResult {
  issue: string;
  severity: "warning" | "critical";
  entity_type: "flight" | "swarm" | "scheduler";
  entity_id: string;
  remediation?: string;
}

export interface RemediationResult {
  action: string;
  entity_id: string;
  success: boolean;
  detail: string;
}

export interface BeekeeperReport {
  summary: string;
  issues_found: number;
  actions_taken: number;
  findings: string[];
}

// ── Observatory ──────────────────────────────────────────────────────

export interface ObservatoryStatus {
  running: boolean;
  pid?: number;
  port?: number;
  url?: string;
}
