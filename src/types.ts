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

export interface GatePolicy {
  type: "approval";
  auto_approve_when?: string;
  timeout_minutes?: number;
  on_timeout?: "approve" | "reject";
}

export type GateSpec = "approval" | GatePolicy;

export interface FlightSpec {
  id: string;
  bee: string;
  type: "single" | "loop" | "sub_swarm";
  loop?: LoopConfig;
  sub_swarm?: SubSwarmConfig;
  failover?: FailoverStep[];
  nectar_refs?: NectarRef[];
  depends_on?: string[];
  when?: string;
  gate?: GateSpec;
  retry_strategy?: RetryStrategy;
  produces?: string[];
  requires?: string[];
  input: string;
  expects: string;
  max_retries: number;
  on_exhausted?: "fail" | "dlq";
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
  checkpoint_interval?: number;
  checkpoint_on_transitions?: boolean;
}

// ── Trigger Spec (swarm chaining) ──────────────────────────────────

export interface TriggerSpec {
  on: "swarm.completed" | "swarm.failed";
  blueprint: string;
  nectar_forward?: string[];
  task_template?: string;
  variables?: Record<string, string>;
  condition?: string;
}

export interface PollingConfig {
  model?: string;
  timeout_seconds?: number;
}

export interface ConcurrencyConfig {
  max_swarms?: number;
  max_flights_per_bee?: number;
}

export interface BlueprintSpec {
  id: string;
  name?: string;
  version?: number;
  description?: string;
  extends?: string;
  polling?: PollingConfig;
  concurrency?: ConcurrencyConfig;
  bees: BeeSpec[];
  flights: FlightSpec[];
  nectar?: Record<string, string>;
  notifications?: {
    url?: string;
  };
  inputs?: InputSpec[];
  beekeeper?: BeekeeperConfig;
  triggers?: TriggerSpec[];
}

// ── Database Records ─────────────────────────────────────────────────

export type SwarmStatus =
  | "buzzing"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "scheduled"
  | "queued";

export interface SwarmRecord {
  id: string;
  swarm_number: number;
  blueprint_id: string;
  task: string;
  status: SwarmStatus;
  nectar: string; // JSON string of Record<string, string>
  notify_url: string | null;
  chain_id: string | null;
  parent_swarm_id: string | null;
  trigger_config: string | null; // JSON string of TriggerSpec
  priority: number;
  schedule_at: string | null;
  parent_flight_id: string | null; // Phase 16: sub-swarm linkage
  profile: string | null; // Phase 19: bound config profile
  created_at: string;
  updated_at: string;
}

export type FlightStatus =
  | "waiting"
  | "pending"
  | "in_flight"
  | "done"
  | "failed"
  | "gated"
  | "sub_swarm"
  | "dead_letter";

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
  type: "single" | "loop" | "sub_swarm";
  loop_config: string | null; // JSON string of LoopConfig
  current_cell_id: string | null;
  abandoned_count: number;
  verify_meta: string | null; // JSON string for verification flight metadata
  depends_on: string | null; // JSON string of string[] (DAG flight IDs)
  when_clause: string | null;
  gate: string | null; // "approval" or null
  retry_at: string | null;
  retry_strategy: string | null; // JSON string of RetryStrategy
  error_context: string | null; // JSON string of additional error context
  checkpoint_data: string | null; // JSON string of checkpoint data
  produces: string | null; // JSON array of nectar keys produced
  requires: string | null; // JSON array of nectar keys required
  gated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Phase 16
  sub_swarm_config: string | null; // JSON string of SubSwarmConfig
  child_swarm_id: string | null;
  failover_config: string | null; // JSON string of FailoverStep[]
  model_override: string | null;
  original_bee_id: string | null;
  // Phase 17
  nectar_refs: string | null; // JSON string of NectarRef[]
  // Phase 18
  on_exhausted: string | null; // "dlq" or null (null = "fail")
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
  requires: string | null; // JSON array of blueprint IDs (Phase 19)
}

// ── Flight Claim Result ──────────────────────────────────────────────

export interface FlightClaimResult {
  flight_id: string;
  swarm_id: string;
  resolved_input: string;
  expects: string;
  type: "single" | "loop" | "sub_swarm";
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
  | "swarm.triggered"
  | "swarm.scheduled"
  | "swarm.promoted"
  | "flight.ready"
  | "flight.claimed"
  | "flight.completed"
  | "flight.failed"
  | "flight.gated"
  | "flight.skipped"
  | "flight.inspector_created"
  | "flight.pulse"
  | "cell.started"
  | "cell.completed"
  | "cell.verifying"
  | "cell.failed"
  | "chain.created"
  | "chain.completed"
  | "chain.failed"
  | "beekeeper.check"
  | "swarm.queued"
  | "swarm.archived"
  | "swarm.replayed"
  | "maintenance.completed"
  | "nectar.injected"
  | "blueprint.versioned"
  | "gate.auto_approved"
  | "gate.timed_out"
  | "swarm.budget_warning"
  | "swarm.budget_exceeded"
  | "flight.cache_hit"
  | "flight.injected"
  | "flight.skipped_manual"
  | "template.created"
  | "template.deleted"
  // Phase 16
  | "subswarm.started"
  | "subswarm.completed"
  | "subswarm.failed"
  | "subswarm.timeout"
  | "flight.model_routed"
  | "anomaly.detected"
  | "anomaly.acknowledged"
  | "flight.failover"
  // Phase 17
  | "nectar.shared"
  | "nectar.share_failed"
  | "registry.synced"
  | "blueprint.rated"
  | "channel.created"
  | "channel.deleted"
  | "route.created"
  | "webhook.inbound"
  | "webhook.token_created"
  | "webhook.token_revoked"
  // Phase 18
  | "schedule.created"
  | "schedule.triggered"
  | "schedule.skipped"
  | "schedule.toggled"
  | "schedule.deleted"
  | "circuit.opened"
  | "circuit.closed"
  | "circuit.half_open"
  | "flight.dead_lettered"
  | "dlq.replayed"
  | "dlq.purged"
  | "blueprint.test_passed"
  | "blueprint.test_failed"
  | "health.snapshot"
  | "health.alert"
  // Phase 19
  | "swarm.tagged"
  | "swarm.untagged"
  | "profile.created"
  | "profile.activated"
  | "profile.deleted"
  | "memory.stored"
  | "memory.forgotten"
  | "memory.pruned"
  | "playbook.created"
  | "playbook.deleted"
  | "playbook.toggled"
  | "playbook.triggered"
  | "playbook.executed"
  | "playbook.cooldown"
  | "blueprint.deps_validated";

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
  entity_type: "flight" | "swarm" | "scheduler" | "webhook";
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

// ── Chain (swarm chaining) ──────────────────────────────────────────

export interface ChainRecord {
  id: string;
  name: string | null;
  root_swarm_id: string;
  status: "active" | "completed" | "failed";
  created_at: string;
  updated_at: string;
}

// ── Blueprint Sources ───────────────────────────────────────────────

export interface BlueprintSourceRecord {
  id: string;
  blueprint_id: string;
  source_type: "bundled" | "local" | "project" | "git" | "package";
  source_uri: string | null;
  pinned_version: number | null;
  installed_version: number | null;
  last_checked_at: string | null;
  created_at: string;
}

// ── Snapshots ───────────────────────────────────────────────────────

export interface SnapshotRecord {
  id: string;
  swarm_id: string;
  snapshot_type: "manual" | "checkpoint" | "auto";
  data: string; // Full JSON snapshot
  created_at: string;
}

// ── Flight Traces ───────────────────────────────────────────────────

export interface FlightTraceRecord {
  id: string;
  flight_id: string;
  swarm_id: string;
  trace_type: "claimed" | "output" | "error" | "retry";
  data: string; // JSON structured trace
  created_at: string;
}

// ── Notification Config ─────────────────────────────────────────────

export interface NotificationConfigRecord {
  id: string;
  default_url: string | null;
  enabled_events: string | null; // JSON array of event types
  format: "standard" | "slack" | "discord";
  created_at: string;
  updated_at: string;
}

// ── Webhook Deliveries ──────────────────────────────────────────────

export interface WebhookDeliveryRecord {
  id: string;
  event_id: string;
  url: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
  response_status: number | null;
  next_retry_at: string | null;
  created_at: string;
}

// ── Phase 11: Flight Pulses ─────────────────────────────────────────

export interface FlightPulseRecord {
  id: string;
  flight_id: string;
  swarm_id: string;
  step: string;
  progress: number; // 0.0–1.0
  message: string | null;
  created_at: string;
}

// ── Phase 11: Flight Usage ──────────────────────────────────────────

export interface FlightUsageRecord {
  id: string;
  flight_id: string;
  swarm_id: string;
  bee_id: string;
  input_tokens: number;
  output_tokens: number;
  estimated: number; // 0 or 1
  created_at: string;
}

// ── Phase 11: Bee Stats ─────────────────────────────────────────────

export interface BeeStatsRecord {
  bee_id: string; // qualified: blueprintId_beeId
  total_flights: number;
  successes: number;
  failures: number;
  avg_duration_seconds: number;
  total_tokens: number;
  success_rate: number;
  updated_at: string;
}

// ── Phase 12: Global Config ──────────────────────────────────────────

export interface HiveConfigRecord {
  key: string;
  value: string;
  updated_at: string;
}

// ── Phase 12: Swarm Archives ─────────────────────────────────────────

export interface SwarmArchiveRecord {
  id: string;
  swarm_number: number;
  blueprint_id: string;
  task: string;
  original_status: string;
  data: string; // JSON string of full swarm state
  archived_at: string;
}

// ── Phase 13: Replay ──────────────────────────────────────────────────

export interface ReplayOptions {
  task?: string;
  variables?: Record<string, string>;
  priority?: number;
  reset_nectar?: boolean;
}

// ── Phase 13: Fleet Metrics ───────────────────────────────────────────

export interface FleetMetrics {
  period: string;
  totals: {
    swarms: number;
    completed: number;
    failed: number;
    cancelled: number;
    success_rate: number;
  };
  daily_trend: Array<{ date: string; started: number; completed: number; failed: number }>;
  per_blueprint: Array<{
    blueprint_id: string;
    swarms: number;
    completed: number;
    failed: number;
    success_rate: number;
    avg_duration_seconds: number | null;
  }>;
  top_bees: Array<{
    bee_id: string;
    total_flights: number;
    success_rate: number;
    avg_duration_seconds: number;
  }>;
}

// ── Phase 13: Maintenance ─────────────────────────────────────────────

export interface MaintenanceResult {
  dry_run: boolean;
  deleted: {
    events: number;
    traces: number;
    checks: number;
    webhooks: number;
    pulses: number;
  };
  total_deleted: number;
}

// ── Phase 13: Blueprint Bundle ────────────────────────────────────────

export interface BlueprintBundle {
  format_version: number;
  blueprint_id: string;
  exported_at: string;
  spec: BlueprintSpec;
  files: Record<string, string>; // relative path → base64 content
}

// ── Phase 14: Swarm Estimation ──────────────────────────────────────

export interface FlightEstimate {
  flight_id: string;
  bee_id: string;
  type: "single" | "loop" | "sub_swarm";
  estimated_duration_seconds: number;
  estimated_tokens: number;
  estimated_cells: number | null;
  confidence: number;
  data_points: number;
}

export interface SwarmEstimate {
  blueprint_id: string;
  total_estimated_duration_seconds: number;
  total_estimated_tokens: number;
  overall_confidence: number;
  estimated_success_rate: number | null;
  per_flight: FlightEstimate[];
  historical_swarms_analyzed: number;
  note: string | null;
}

// ── Phase 14: Adaptive Tuning ───────────────────────────────────────

export interface TuningRecommendation {
  bee_id: string;
  parameter: string;
  current_value: number;
  recommended_value: number;
  reasoning: string;
  confidence: number;
}

export interface TuningReport {
  blueprint_id: string;
  recommendations: TuningRecommendation[];
  analyzed_bees: number;
  data_quality: "insufficient" | "limited" | "good" | "excellent";
  applied: boolean;
}

// ── Phase 14: Blueprint Versioning ──────────────────────────────────

export interface BlueprintVersionRecord {
  id: string;
  blueprint_id: string;
  version_number: number;
  spec: string;
  changes_summary: string | null;
  installed_at: string;
}

export interface BlueprintDiff {
  from_version: number;
  to_version: number;
  bees_added: string[];
  bees_removed: string[];
  bees_changed: string[];
  flights_added: string[];
  flights_removed: string[];
  flights_changed: string[];
  other_changes: string[];
}

// ── Phase 15: Swarm Budgets ─────────────────────────────────────────

export interface BudgetStatus {
  swarm_id: string;
  token_budget: number;
  budget_action: "warn" | "pause" | "cancel";
  consumed: number;
  remaining: number;
  utilization: number; // 0.0–1.0
  exceeded: boolean;
  projection: number | null; // projected total based on flight count
}

export interface BudgetSetResult {
  swarm_id: string;
  token_budget: number;
  budget_action: string;
  consumed: number;
}

// ── Phase 15: Flight Caching ────────────────────────────────────────

export interface CacheEntry {
  id: string;
  blueprint_id: string;
  flight_id: string;
  input_hash: string;
  output: string;
  nectar_keys: string | null;
  created_at: string;
  expires_at: string;
  hit_count: number;
}

export interface CacheStats {
  entries: number;
  total_hits: number;
  enabled: boolean;
  ttl_hours: number;
  expired: number;
}

export interface CacheClearResult {
  deleted: number;
  scope: string;
}

// ── Phase 15: Swarm Comparison ──────────────────────────────────────

export interface FlightComparison {
  flight_id: string;
  a_status: string;
  b_status: string;
  a_duration_seconds: number | null;
  b_duration_seconds: number | null;
  status_match: boolean;
}

export interface ComparisonSummary {
  flights_match: number;
  flights_differ: number;
  a_total_duration: number;
  b_total_duration: number;
  a_total_tokens: number;
  b_total_tokens: number;
  nectar_diff_keys: string[];
}

export interface SwarmComparison {
  swarm_a: { id: string; task: string; status: string; blueprint_id: string };
  swarm_b: { id: string; task: string; status: string; blueprint_id: string };
  flights: FlightComparison[];
  summary: ComparisonSummary;
  markdown: string;
}

// ── Phase 15: Dynamic Pipeline ──────────────────────────────────────

export interface FlightInjectResult {
  success: boolean;
  flight_uuid: string;
  flight_id: string;
  flight_index: number;
  message: string;
}

export interface FlightSkipResult {
  success: boolean;
  flight_id: string;
  message: string;
}

// ── Phase 15: Swarm Templates ───────────────────────────────────────

export interface SwarmTemplate {
  id: string;
  name: string;
  blueprint_id: string;
  description: string | null;
  variables: string; // JSON
  priority: number;
  options: string; // JSON
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateSaveResult {
  template: SwarmTemplate;
  message: string;
}

export interface TemplateRunResult {
  template_name: string;
  swarm_id: string;
  swarm_number: number;
  status: string;
}

// ── Phase 14: Nectar Injection ──────────────────────────────────────

export interface NectarSetResult {
  swarm_id: string;
  key: string;
  value: string;
  old_value: string | null;
  epoch: number;
}

export interface NectarGetResult {
  swarm_id: string;
  nectar: Record<string, string>;
  key?: string;
  value?: string;
}

// ── Phase 16: Sub-swarm Config ──────────────────────────────────────

export interface SubSwarmConfig {
  blueprint: string;
  task_template: string;
  variables?: Record<string, string>;
  nectar_map?: Record<string, string>; // child_key → parent_nectar_key
  timeout_minutes?: number;
}

// ── Phase 16: Model Routing ─────────────────────────────────────────

export type ModelTier = "fast" | "balanced" | "quality";

export interface ModelRoutingRule {
  condition: string; // "retry_count > 0", "flight.type == loop", etc.
  tier: ModelTier;
}

export interface ModelRoutingConfig {
  default_tier: ModelTier;
  tiers: Record<ModelTier, string>; // tier → model name
  rules?: ModelRoutingRule[];
}

export interface ModelRoutingLogRecord {
  id: string;
  flight_id: string;
  swarm_id: string;
  bee_id: string;
  selected_tier: ModelTier;
  selected_model: string;
  reason: string;
  created_at: string;
}

// ── Phase 16: Anomaly Detection ─────────────────────────────────────

export interface FlightBaselineRecord {
  id: string;
  blueprint_id: string;
  flight_id: string;
  metric: string; // "duration_seconds" | "tokens" | "failure_rate"
  mean: number;
  stddev: number;
  sample_count: number;
  updated_at: string;
}

export interface AnomalyAlertRecord {
  id: string;
  swarm_id: string;
  flight_id: string;
  blueprint_id: string;
  metric: string;
  observed_value: number;
  expected_mean: number;
  expected_stddev: number;
  sigma_deviation: number;
  severity: "warning" | "critical";
  acknowledged: number; // 0 or 1
  created_at: string;
}

// ── Phase 16: Failover ──────────────────────────────────────────────

export interface FailoverStep {
  bee?: string;
  model?: string;
  max_retries?: number;
}

// ── Phase 16: DAG Visualization ─────────────────────────────────────

export interface DAGNode {
  id: string;
  bee_id: string;
  type: "single" | "loop" | "sub_swarm";
  status: FlightStatus;
  duration_seconds: number | null;
  layer: number;
}

export interface DAGEdge {
  from: string;
  to: string;
}

export interface DAGView {
  nodes: DAGNode[];
  edges: DAGEdge[];
  critical_path: string[];
  parallelism_ratio: number;
  total_layers: number;
}

// ── Phase 17: Nectar Sharing ────────────────────────────────────────

export interface NectarRef {
  key: string;
  from_swarm: string; // swarm ID, template var, or "latest:<blueprint_id>"
  from_key: string;
  required?: boolean;
}

export interface NectarShareRecord {
  id: string;
  target_swarm_id: string;
  target_flight_id: string;
  source_swarm_id: string;
  key: string;
  from_key: string;
  value: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ── Phase 17: Registry ──────────────────────────────────────────────

export interface RegistryCacheRecord {
  id: string;
  registry_url: string;
  blueprint_id: string;
  name: string | null;
  description: string | null;
  version: number | null;
  author: string | null;
  tags: string | null; // JSON array
  cached_at: string;
}

export interface BlueprintRatingRecord {
  id: string;
  blueprint_id: string;
  rating: number; // 1-5
  comment: string | null;
  created_at: string;
}

// ── Phase 17: Notification Channels ─────────────────────────────────

export type NotificationChannelType = "webhook" | "slack" | "discord" | "pagerduty";

export interface NotificationChannelRecord {
  id: string;
  name: string;
  channel_type: NotificationChannelType;
  config: string; // JSON
  enabled: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface NotificationRouteRecord {
  id: string;
  event_pattern: string; // glob pattern like "swarm.*", "flight.failed"
  channel_id: string;
  priority: number;
  created_at: string;
}

export interface SlackChannelConfig {
  webhook_url: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

export interface DiscordChannelConfig {
  webhook_url: string;
  username?: string;
  avatar_url?: string;
}

export interface PagerDutyChannelConfig {
  routing_key: string;
  severity?: "critical" | "error" | "warning" | "info";
}

export interface WebhookChannelConfig {
  url: string;
  headers?: Record<string, string>;
  format?: "standard" | "slack" | "discord";
}

// ── Phase 17: Inbound Webhooks ──────────────────────────────────────

export type InboundWebhookPermission =
  | "swarm:start"
  | "gate:approve"
  | "nectar:set"
  | "swarm:stop";

export interface WebhookTokenRecord {
  id: string;
  name: string;
  token_hash: string;
  permissions: string; // JSON array of InboundWebhookPermission
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface WebhookAuditRecord {
  id: string;
  token_id: string;
  action: string;
  payload: string | null; // JSON
  ip_address: string | null;
  status: "success" | "denied" | "error";
  created_at: string;
}

// ── Phase 18: Scheduled Swarms ──────────────────────────────────────

export interface SwarmScheduleRecord {
  id: string;
  name: string;
  blueprint_id: string;
  cron_expression: string;
  task_template: string;
  variables: string; // JSON
  overlap_behavior: "skip" | "queue" | "cancel_previous";
  enabled: number; // 0 or 1
  priority: number;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRunRecord {
  id: string;
  schedule_id: string;
  swarm_id: string | null;
  triggered_at: string;
  status: string;
  created_at: string;
}

// ── Phase 18: Circuit Breakers ──────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerRecord {
  id: string;
  bee_id: string;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  opened_at: string | null;
  half_open_at: string | null;
  threshold: number;
  timeout_minutes: number;
  created_at: string;
  updated_at: string;
}

// ── Phase 18: Dead Letter Queue ─────────────────────────────────────

export type DeadLetterStatus = "pending" | "replayed" | "purged";

export interface DeadLetterRecord {
  id: string;
  flight_uuid: string;
  swarm_id: string;
  flight_id: string;
  bee_id: string;
  last_error: string;
  retry_count: number;
  error_context: string | null;
  status: DeadLetterStatus;
  replayed_at: string | null;
  created_at: string;
}

// ── Phase 18: Blueprint Testing ─────────────────────────────────────

export interface BlueprintTestCaseRecord {
  id: string;
  blueprint_id: string;
  name: string;
  description: string | null;
  mock_inputs: string; // JSON
  mock_outputs: string; // JSON
  assertions: string; // JSON
  created_at: string;
  updated_at: string;
}

export interface BlueprintTestRunRecord {
  id: string;
  blueprint_id: string;
  test_case_id: string;
  passed: number; // 0 or 1
  results: string; // JSON
  duration_ms: number;
  created_at: string;
}

export type TestAssertionType = "nectar_equals" | "nectar_contains" | "nectar_exists" | "flight_status";

export interface TestAssertion {
  type: TestAssertionType;
  target: string;
  expected?: string;
}

export interface TestAssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actual?: string;
  message: string;
}

// ── Phase 18: Hive Health Score ─────────────────────────────────────

export interface HealthFactor {
  name: string;
  score: number; // 0-100
  weight: number; // 0.0-1.0
  detail: string;
}

export interface HealthSnapshot {
  id: string;
  composite_score: number;
  factors: string; // JSON array of HealthFactor
  computed_at: string;
}

export interface HealthScoreResult {
  composite_score: number;
  trend: "improving" | "declining" | "stable";
  factors: HealthFactor[];
  computed_at: string;
}

// ── Phase 19: Swarm Tags ────────────────────────────────────────────

export interface SwarmTagRecord {
  id: string;
  swarm_id: string;
  key: string;
  value: string;
  created_at: string;
}

export interface SwarmSearchFilters {
  query?: string;
  status?: SwarmStatus;
  blueprint_id?: string;
  tags?: Record<string, string>; // key → value
  from?: string; // ISO date
  to?: string; // ISO date
  limit?: number;
  offset?: number;
}

export interface SwarmSearchResult {
  swarms: Array<SwarmRecord & { tags: Record<string, string> }>;
  total: number;
  limit: number;
  offset: number;
}

// ── Phase 19: Hive Profiles ─────────────────────────────────────────

export interface HiveProfileRecord {
  id: string;
  name: string;
  description: string | null;
  overrides: string; // JSON Record<string, string>
  created_at: string;
  updated_at: string;
}

// ── Phase 19: Bee Memory ────────────────────────────────────────────

export interface BeeMemoryRecord {
  id: string;
  bee_id: string;
  namespace: string;
  key: string;
  value: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Phase 19: Blueprint Dependencies ────────────────────────────────

export interface DependencyGraphNode {
  id: string;
  name: string | null;
  installed: boolean;
  requires: string[];
}

export interface DependencyGraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  missing: string[];
  cycles: string[][];
  valid: boolean;
}

// ── Phase 19: Playbooks ─────────────────────────────────────────────

export type PlaybookTriggerType =
  | "health_below"
  | "swarm_failure_rate"
  | "circuit_open_count"
  | "dead_letter_count"
  | "queue_depth";

export type PlaybookActionType =
  | "pause_swarms"
  | "cancel_swarms"
  | "reset_circuits"
  | "purge_dlq"
  | "notify"
  | "run_maintenance";

export interface PlaybookAction {
  type: PlaybookActionType;
  params?: Record<string, string>;
}

export interface PlaybookRecord {
  id: string;
  name: string;
  description: string | null;
  trigger_condition: string; // JSON { type: PlaybookTriggerType, threshold: number }
  actions: string; // JSON PlaybookAction[]
  cooldown_minutes: number;
  enabled: number; // 0 or 1
  last_executed_at: string | null;
  execution_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlaybookExecutionRecord {
  id: string;
  playbook_id: string;
  trigger_value: number;
  actions_taken: string; // JSON
  results: string; // JSON
  success: number; // 0 or 1
  created_at: string;
}
