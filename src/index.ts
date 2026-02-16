import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb } from "./db.js";
import * as db from "./db.js";
import { discoverBundledBlueprints, loadBlueprint } from "./blueprint/loader.js";
import { logger } from "./lib/logger.js";
import { safeJsonParse } from "./lib/json.js";

// ── Module imports ───────────────────────────────────────────────────

import { createSwarmFromBlueprint } from "./swarm/create.js";
import { getSwarmStatus } from "./swarm/status.js";
import { stopSwarm } from "./swarm/stop.js";
import { resumeSwarm } from "./swarm/resume.js";
import { peekFlight } from "./flight/peek.js";
import { claimFlight } from "./flight/claim.js";
import { completeFlight } from "./flight/complete.js";
import { failFlight } from "./flight/fail.js";
import { scheduler } from "./pollinator/scheduler.js";
import { pollinate } from "./pollinator/poll.js";
import { runBeekeeperCheck } from "./beekeeper/monitor.js";
import { startObservatory, stopObservatory, getObservatoryStatus } from "./observatory/daemon.js";
import { approveFlight } from "./flight/gate.js";
import { getBlueprintInfo } from "./blueprint/info.js";
import { getSwarmAnalytics } from "./swarm/analytics.js";
import { createSnapshot } from "./snapshot/create.js";
import { listSnapshots } from "./snapshot/list.js";
import { restoreSnapshot } from "./snapshot/restore.js";
import { createCheckpoint } from "./snapshot/checkpoint.js";
import { getFlightTraces, getSwarmTraces } from "./trace/query.js";
import { getConfig, setConfig } from "./notification/config.js";
import { retryDelivery, retryAllFailed } from "./notification/webhook.js";
import { getChainStatus, listChains as listChainsQuery } from "./chain/status.js";
import { scaffoldBlueprint } from "./blueprint/scaffold.js";
import { validateBlueprint } from "./blueprint/validate.js";
import { dryRunBlueprint } from "./blueprint/dryrun.js";
import { installRemoteBlueprint } from "./blueprint/remote.js";
import { reportPulse, getFlightProgress } from "./flight/pulse.js";
import { getSwarmUsage } from "./usage/aggregate.js";
import { getBeeStatsQuery } from "./usage/bee-stats.js";
import { getGlobalConfig, setGlobalConfig } from "./config/global.js";
import { getQueueStatus } from "./concurrency/queue-status.js";
import { archiveSwarm } from "./archive/archive.js";
import { getStorageStatus } from "./archive/storage.js";
import { generateSwarmReport } from "./report/generate.js";
import { replaySwarm } from "./replay/replay.js";
import { getFleetMetrics } from "./metrics/fleet.js";
import { runMaintenance } from "./maintenance/janitor.js";
import { exportBlueprint, importBlueprint } from "./blueprint/export.js";
import { estimateSwarm } from "./adaptive/estimate.js";
import { analyzeTuning } from "./adaptive/tuner.js";
import { setNectarKey, getNectar } from "./nectar/inject.js";
import { recordVersion, getBlueprintHistory, diffBlueprintVersions } from "./blueprint/version.js";
import { parseGateSpec, resolveGatePolicy } from "./flight/gate-policy.js";
import { setBudget, getBudgetStatus } from "./budget/budget.js";
import { getCacheStatus, clearCache } from "./cache/cache.js";
import { compareSwarms } from "./compare/compare.js";
import { injectFlight, skipFlight } from "./pipeline/dynamic.js";
import { saveTemplate, listSavedTemplates, runTemplate } from "./swarm/templates.js";
import { computeDAG } from "./observatory/dag.js";
import { getStreamStatus } from "./observatory/stream.js";
import { getSubSwarmStatus } from "./flight/sub-swarm.js";
import { getRoutingHistory } from "./routing/model-router.js";
import { getAlerts, acknowledgeAlert } from "./anomaly/detector.js";
import { getBaselines } from "./anomaly/baselines.js";
import { getNectarShares, manualResolve } from "./nectar/share.js";
import { syncRegistry, searchRegistry as searchRegistryFn, installFromRegistry, rateBlueprint, getBlueprintRatings as getRegistryRatings } from "./registry/client.js";
import { createChannel, listChannels, deleteChannel } from "./notification/channels.js";
import { createRoute, listRoutes, deleteRoute } from "./notification/router.js";
import { createToken, listTokens, revokeToken } from "./webhook/tokens.js";
import { getAuditLog } from "./webhook/inbound.js";
import type { BlueprintSpec, GatePolicy, HiveEventType, NotificationChannelType, InboundWebhookPermission } from "./types.js";

// ── Initialize ───────────────────────────────────────────────────────

initDb();
logger.info("Hive MCP server starting");

// Re-register buzzing swarms with the scheduler on startup
const buzzingSwarms = db.listSwarms({ status: "buzzing" });
for (const swarm of buzzingSwarms) {
  const bp = db.getBlueprint(swarm.blueprint_id);
  if (bp) {
    const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
    if (spec) scheduler.registerSwarm(swarm.id, spec);
  }
}
if (buzzingSwarms.length > 0) {
  logger.info("Scheduler: re-registered buzzing swarms on startup", { count: buzzingSwarms.length });
}

const server = new McpServer({
  name: "hive",
  version: "0.2.0",
});

/** Wrap an MCP tool handler to catch unexpected errors and return isError responses */
function errorBoundary<T>(
  fn: (args: T) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>,
): (args: T) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  return async (args: T) => {
    try {
      return await fn(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Tool error", { error: message });
      return { content: [{ type: "text" as const, text: `Internal error: ${message}` }], isError: true };
    }
  };
}

// ── Blueprint Tools ──────────────────────────────────────────────────

server.tool(
  "hive_blueprint_list",
  "List available and installed blueprints",
  {},
  async () => {
    const installed = db.listBlueprints();
    const bundled = discoverBundledBlueprints();

    const installedIds = new Set(installed.map(b => b.id));
    const available = bundled.filter(b => !installedIds.has(b.id));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ installed, available }, null, 2),
      }],
    };
  },
);

server.tool(
  "hive_blueprint_install",
  "Install a blueprint by ID",
  { blueprint_id: z.string().describe("The blueprint ID to install") },
  async ({ blueprint_id }) => {
    const result = loadBlueprint(blueprint_id);
    if (!result.success) {
      return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    }

    const bp = result.blueprint;
    db.insertBlueprint(bp.id, bp.name ?? null, bp.version ?? null, JSON.stringify(bp));
    recordVersion(bp.id, bp);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: `Blueprint "${bp.id}" installed successfully`,
          blueprint: { id: bp.id, name: bp.name, bees: bp.bees.length, flights: bp.flights.length },
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "hive_blueprint_uninstall",
  "Uninstall a blueprint",
  { blueprint_id: z.string().describe("The blueprint ID to uninstall") },
  async ({ blueprint_id }) => {
    const existing = db.getBlueprint(blueprint_id);
    if (!existing) {
      return { content: [{ type: "text", text: `Blueprint "${blueprint_id}" is not installed` }], isError: true };
    }
    db.deleteBlueprint(blueprint_id);
    return {
      content: [{ type: "text", text: `Blueprint "${blueprint_id}" uninstalled` }],
    };
  },
);

server.tool(
  "hive_blueprint_info",
  "Get detailed blueprint information including input schema, flights, and beekeeper config",
  { blueprint_id: z.string().describe("The blueprint ID to inspect") },
  errorBoundary(async ({ blueprint_id }) => {
    const result = getBlueprintInfo(blueprint_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }),
);

// ── Swarm Tools ──────────────────────────────────────────────────────

server.tool(
  "hive_swarm_start",
  "Start a new swarm from a blueprint to execute a task",
  {
    blueprint_id: z.string().describe("The blueprint ID to use"),
    task: z.string().describe("The task description for the swarm"),
    variables: z.record(z.string(), z.string()).optional().describe("Optional input variables for the blueprint"),
    priority: z.number().int().min(1).max(10).optional().describe("Swarm priority (1-10, default 5). Higher priority flights are claimed first."),
    schedule_at: z.string().optional().describe("ISO 8601 timestamp to delay swarm start. Swarm enters 'scheduled' status until time arrives."),
  },
  async ({ blueprint_id, task, variables, priority, schedule_at }) => {
    const result = createSwarmFromBlueprint(blueprint_id, task, variables, undefined, undefined, { priority, schedule_at });
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }

    // Register with scheduler (only if not scheduled or queued)
    if (!schedule_at && result.data.status !== "queued") {
      const bp = db.getBlueprint(blueprint_id);
      if (bp) {
        const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
        if (spec) scheduler.registerSwarm(result.data.id, spec);
      }
    }

    const actionMsg = result.data.status === "queued"
      ? `Swarm #${result.data.number} queued (concurrency limit)`
      : schedule_at
        ? `Swarm #${result.data.number} scheduled`
        : `Swarm #${result.data.number} started`;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: actionMsg,
          swarm: result.data,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "hive_swarm_status",
  "Get the status of a swarm by number, ID, or task search",
  { query: z.string().describe("Swarm number, ID prefix, or task substring") },
  async ({ query }) => {
    const result = getSwarmStatus(query);
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
    };
  },
);

server.tool(
  "hive_swarm_list",
  "List all swarms with optional filters",
  {
    status: z.enum(["buzzing", "paused", "blocked", "completed", "failed", "cancelled", "scheduled", "queued"]).optional().describe("Filter by status"),
    limit: z.number().optional().describe("Max number of swarms to return"),
  },
  async ({ status, limit }) => {
    const swarms = db.listSwarms({
      status,
      limit: limit ?? 20,
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify(swarms.map(s => ({
          number: s.swarm_number,
          id: s.id,
          blueprint: s.blueprint_id,
          task: s.task,
          status: s.status,
          created: s.created_at,
        })), null, 2),
      }],
    };
  },
);

server.tool(
  "hive_swarm_stop",
  "Cancel a running swarm",
  { swarm_id: z.string().describe("The swarm ID to cancel") },
  async ({ swarm_id }) => {
    const result = stopSwarm(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    scheduler.unregisterSwarm(swarm_id);
    return { content: [{ type: "text", text: result.message }] };
  },
);

server.tool(
  "hive_swarm_resume",
  "Resume a failed swarm by resetting failed flights and cells",
  { swarm_id: z.string().describe("The swarm ID to resume") },
  async ({ swarm_id }) => {
    const result = resumeSwarm(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }

    // Re-register with scheduler on resume
    const swarm = db.getSwarm(swarm_id);
    if (swarm && !scheduler.isRegistered(swarm_id)) {
      const bp = db.getBlueprint(swarm.blueprint_id);
      if (bp) {
        const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
        if (spec) scheduler.registerSwarm(swarm_id, spec);
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: result.message,
          reset_flights: result.resetFlights,
          reset_cells: result.resetCells,
        }, null, 2),
      }],
    };
  },
);

// ── Flight Tools ─────────────────────────────────────────────────────

server.tool(
  "hive_flight_peek",
  "Check if a bee has pending work (lightweight check)",
  { bee_id: z.string().describe("The bee ID to check (format: blueprintId_beeId)") },
  async ({ bee_id }) => {
    const result = peekFlight(bee_id);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          bee_id: result.beeId,
          has_work: result.hasWork,
          pending_count: result.pendingCount,
        }),
      }],
    };
  },
);

server.tool(
  "hive_flight_claim",
  "Claim the next pending flight for a bee",
  { bee_id: z.string().describe("The bee ID claiming work") },
  async ({ bee_id }) => {
    const result = claimFlight(bee_id);
    if (!result.claimed) {
      return {
        content: [{ type: "text", text: JSON.stringify({ bee_id, claimed: false, message: "No pending flights" }) }],
      };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ claimed: true, ...result.data }, null, 2),
      }],
    };
  },
);

server.tool(
  "hive_flight_complete",
  "Mark a flight as done with output",
  {
    flight_id: z.string().describe("The flight UUID to complete"),
    output: z.string().describe("The flight output (KEY: value format)"),
  },
  async ({ flight_id, output }) => {
    const result = completeFlight(flight_id, output);
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: result.message }] };
  },
);

server.tool(
  "hive_flight_fail",
  "Mark a flight as failed with an error message and optional context",
  {
    flight_id: z.string().describe("The flight UUID that failed"),
    error: z.string().describe("Error message describing the failure"),
    context: z.string().optional().describe("Optional additional context (bee output, stack traces)"),
  },
  async ({ flight_id, error, context }) => {
    const result = failFlight(flight_id, error, context);
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: result.message }] };
  },
);

// ── Gate Tools ──────────────────────────────────────────────────────

server.tool(
  "hive_gate_approve",
  "Approve a gated flight to unblock it and continue the swarm pipeline",
  {
    flight_id: z.string().describe("The flight UUID to approve"),
    message: z.string().optional().describe("Optional approval message"),
  },
  errorBoundary(async ({ flight_id, message }) => {
    const result = approveFlight(flight_id, message);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: result.message }] };
  }),
);

// ── Pollinator Tools ────────────────────────────────────────────────

server.tool(
  "hive_pollinate",
  "Poll for ready work across all registered swarms and return spawn requests for the coordinator",
  {
    swarm_id: z.string().optional().describe("Optional: filter to a specific swarm ID"),
  },
  async ({ swarm_id }) => {
    const result = pollinate(swarm_id);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// ── Swarm Summary + Epoch Tools ─────────────────────────────────────

server.tool(
  "hive_swarm_summary",
  "Get a compact swarm status summary optimized for the coordinator loop (status, pipeline, cell counts, active bees)",
  { swarm_id: z.string().describe("The swarm ID") },
  async ({ swarm_id }) => {
    const swarm = db.getSwarm(swarm_id);
    if (!swarm) {
      return { content: [{ type: "text" as const, text: `Swarm not found: ${swarm_id}` }], isError: true };
    }

    const flights = db.getFlightsForSwarm(swarm_id);
    const regularFlights = flights.filter(f => !f.verify_meta);
    const cells = db.getCellsForSwarm(swarm_id);

    const pipeline = regularFlights.map(f => ({
      id: f.flight_id,
      status: f.status,
      bee: f.bee_id,
      type: f.type,
      started_at: f.started_at,
      completed_at: f.completed_at,
    }));

    const cellCounts = {
      total: cells.length,
      done: cells.filter(c => c.status === "done").length,
      in_progress: cells.filter(c => c.status === "in_progress").length,
      pending: cells.filter(c => c.status === "pending").length,
      verifying: cells.filter(c => c.status === "verifying").length,
      failed: cells.filter(c => c.status === "failed").length,
    };

    const activeBees = regularFlights
      .filter(f => f.status === "in_flight")
      .map(f => f.bee_id);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          swarm_id: swarm.id,
          swarm_number: swarm.swarm_number,
          status: swarm.status,
          task: swarm.task,
          pipeline,
          cells: cellCounts,
          active_bees: activeBees,
          epoch: db.getEpoch(),
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "hive_check_epoch",
  "Check the current epoch counter. Use for change detection — if epoch hasn't changed, skip expensive queries.",
  {},
  async () => {
    const epoch = db.getEpoch();
    return {
      content: [{ type: "text", text: JSON.stringify({ epoch }) }],
    };
  },
);

// ── Analytics Tools ─────────────────────────────────────────────────

server.tool(
  "hive_swarm_analytics",
  "Get performance analytics for a swarm: flight/cell durations, bottleneck, bee utilization, parallelism ratio",
  { swarm_id: z.string().describe("The swarm ID to analyze") },
  errorBoundary(async ({ swarm_id }) => {
    const result = getSwarmAnalytics(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }),
);

// ── Cell Tools ───────────────────────────────────────────────────────

server.tool(
  "hive_cell_list",
  "List all cells for a swarm",
  { swarm_id: z.string().describe("The swarm ID") },
  async ({ swarm_id }) => {
    const cells = db.getCellsForSwarm(swarm_id);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(cells.map(c => ({
          id: c.id,
          cell_id: c.cell_id,
          title: c.title,
          status: c.status,
          retries: c.retry_count,
        })), null, 2),
      }],
    };
  },
);

// ── Beekeeper Tools ──────────────────────────────────────────────────

server.tool(
  "hive_beekeeper_check",
  "Run a health check on the hive",
  {},
  async () => {
    const report = runBeekeeperCheck();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(report, null, 2),
      }],
    };
  },
);

server.tool(
  "hive_beekeeper_status",
  "Get recent beekeeper check history",
  {},
  async () => {
    const checks = db.getRecentBeekeeperChecks(10);
    return {
      content: [{ type: "text", text: JSON.stringify(checks, null, 2) }],
    };
  },
);

// ── Snapshot Tools ───────────────────────────────────────────────────

server.tool(
  "hive_snapshot_create",
  "Export full swarm state (nectar, flights, cells, outputs) as a JSON snapshot",
  { swarm_id: z.string().describe("The swarm ID to snapshot") },
  errorBoundary(async ({ swarm_id }) => {
    const result = createSnapshot(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ message: "Snapshot created", snapshot_id: result.snapshot.id, type: result.snapshot.snapshot_type }, null, 2) }] };
  }),
);

server.tool(
  "hive_snapshot_list",
  "List snapshots for a swarm",
  { swarm_id: z.string().describe("The swarm ID") },
  errorBoundary(async ({ swarm_id }) => {
    const result = listSnapshots(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.snapshots.map(s => ({ id: s.id, type: s.snapshot_type, created_at: s.created_at })), null, 2) }] };
  }),
);

server.tool(
  "hive_snapshot_restore",
  "Restore swarm to a snapshot state (reset flights, cells, nectar)",
  { snapshot_id: z.string().describe("The snapshot ID to restore") },
  errorBoundary(async ({ snapshot_id }) => {
    const result = restoreSnapshot(snapshot_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "hive_checkpoint_create",
  "Create a checkpoint snapshot for a swarm",
  { swarm_id: z.string().describe("The swarm ID") },
  errorBoundary(async ({ swarm_id }) => {
    const result = createCheckpoint(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ message: "Checkpoint created", snapshot_id: result.snapshot.id }, null, 2) }] };
  }),
);

// ── Trace Tools ─────────────────────────────────────────────────────

server.tool(
  "hive_flight_trace",
  "View structured execution traces for a flight or entire swarm",
  {
    flight_id: z.string().optional().describe("Specific flight UUID to trace"),
    swarm_id: z.string().optional().describe("Swarm ID to get all traces"),
  },
  errorBoundary(async ({ flight_id, swarm_id }) => {
    if (flight_id) {
      const result = getFlightTraces(flight_id);
      if (!result.success) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result.traces, null, 2) }] };
    }
    if (swarm_id) {
      const result = getSwarmTraces(swarm_id);
      if (!result.success) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result.traces, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: "Provide either flight_id or swarm_id" }], isError: true };
  }),
);

// ── Notification Tools ──────────────────────────────────────────────

server.tool(
  "hive_notification_config",
  "Get or set global notification configuration (webhook URL, enabled events, payload format)",
  {
    url: z.string().optional().describe("Webhook URL to set"),
    events: z.array(z.string()).optional().describe("Event types to enable (e.g. swarm.completed, flight.failed)"),
    format: z.enum(["standard", "slack", "discord"]).optional().describe("Payload format"),
  },
  errorBoundary(async ({ url, events, format }) => {
    if (url !== undefined || events !== undefined || format !== undefined) {
      const result = setConfig({
        url,
        events: events as HiveEventType[] | undefined,
        format,
      });
      if (!result.success) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ message: "Configuration updated", config: result.config }, null, 2) }] };
    }
    const result = getConfig();
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.config, null, 2) }] };
  }),
);

server.tool(
  "hive_notification_test",
  "Send a test webhook to the configured URL and report success/failure",
  {
    url: z.string().optional().describe("Override URL to test (uses global config URL if not provided)"),
  },
  errorBoundary(async ({ url }) => {
    const configResult = getConfig();
    const globalConfig = configResult.success ? configResult.config : null;
    const targetUrl = url ?? globalConfig?.default_url;
    if (!targetUrl) {
      return { content: [{ type: "text" as const, text: "No webhook URL configured. Set one with hive_notification_config first." }], isError: true };
    }

    const format = globalConfig?.format ?? "standard";
    const { formatPayload } = await import("./notification/format.js");
    const testEvent = {
      id: "test-event",
      event_type: "swarm.completed",
      swarm_id: "test-swarm-id",
      payload: JSON.stringify({ reason: "test_webhook" }),
      created_at: new Date().toISOString(),
    };
    const payload = formatPayload(testEvent, format as "standard" | "slack" | "discord");

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: response.ok,
            url: targetUrl,
            status: response.status,
            format,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            url: targetUrl,
            error: err instanceof Error ? err.message : String(err),
          }, null, 2),
        }],
        isError: true,
      };
    }
  }),
);

server.tool(
  "hive_notification_history",
  "View webhook delivery history with optional status filter",
  {
    status: z.enum(["pending", "delivered", "failed"]).optional().describe("Filter by delivery status"),
    limit: z.number().optional().describe("Max number of deliveries to return (default 20)"),
  },
  errorBoundary(async ({ status, limit }) => {
    const deliveries = db.listWebhookDeliveries({ status, limit: limit ?? 20 });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(deliveries.map(d => ({
          id: d.id,
          event_id: d.event_id,
          url: d.url,
          status: d.status,
          attempts: d.attempts,
          max_attempts: d.max_attempts,
          last_error: d.last_error,
          created_at: d.created_at,
        })), null, 2),
      }],
    };
  }),
);

server.tool(
  "hive_notification_retry",
  "Retry failed webhook deliveries (specific delivery or all failed)",
  {
    delivery_id: z.string().optional().describe("Specific delivery ID to retry (retries all failed if omitted)"),
  },
  errorBoundary(async ({ delivery_id }) => {
    if (delivery_id) {
      const result = await retryDelivery(delivery_id);
      if (!result.success) {
        return { content: [{ type: "text" as const, text: result.error! }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ message: "Delivery retried", success: result.success }) }] };
    }
    const result = await retryAllFailed();
    return { content: [{ type: "text" as const, text: JSON.stringify({ message: `Retried ${result.retried} deliveries, ${result.succeeded} succeeded` }, null, 2) }] };
  }),
);

// ── Chain Tools ─────────────────────────────────────────────────────

server.tool(
  "hive_chain_status",
  "View all swarms in a chain with parent-child relationships and status",
  { chain_id: z.string().describe("The chain ID to inspect") },
  errorBoundary(async ({ chain_id }) => {
    const result = getChainStatus(chain_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
  }),
);

server.tool(
  "hive_chain_list",
  "List all chains with optional status filter",
  {
    status: z.enum(["active", "completed", "failed"]).optional().describe("Filter by chain status"),
  },
  errorBoundary(async ({ status }) => {
    const result = listChainsQuery(status);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.chains, null, 2) }] };
  }),
);

// ── Blueprint Ecosystem Tools ───────────────────────────────────────

server.tool(
  "hive_blueprint_scaffold",
  "Generate a new blueprint directory with skeleton YAML and bee identity files",
  {
    blueprint_id: z.string().describe("Blueprint ID (lowercase, hyphens allowed)"),
    location: z.enum(["project", "global"]).optional().describe("Where to create (default: project-local)"),
  },
  errorBoundary(async ({ blueprint_id, location }) => {
    const result = scaffoldBlueprint(blueprint_id, { location });
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ message: result.message, directory: result.dir }, null, 2) }] };
  }),
);

server.tool(
  "hive_blueprint_validate",
  "Validate a blueprint against schema plus semantic checks (nectar reachability, role consistency, cycle detection)",
  { blueprint_id: z.string().describe("The blueprint ID to validate") },
  errorBoundary(async ({ blueprint_id }) => {
    const result = validateBlueprint(blueprint_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ valid: result.valid, issues: result.issues }, null, 2) }] };
  }),
);

server.tool(
  "hive_blueprint_dryrun",
  "Simulate pipeline execution without spawning bees — shows flight order, dependency graph, and template resolution preview",
  {
    blueprint_id: z.string().describe("The installed blueprint ID to simulate"),
    variables: z.record(z.string(), z.string()).optional().describe("Optional variables for template preview"),
  },
  errorBoundary(async ({ blueprint_id, variables }) => {
    const result = dryRunBlueprint(blueprint_id, variables);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
  }),
);

server.tool(
  "hive_blueprint_install_remote",
  "Install a blueprint from a Git repo URL (shallow clone, validate, copy to blueprints directory)",
  {
    url: z.string().describe("Git repository URL to clone"),
    subdirectory: z.string().optional().describe("Subdirectory within the repo containing the blueprint"),
  },
  errorBoundary(async ({ url, subdirectory }) => {
    const result = installRemoteBlueprint(url, { subdirectory });
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ message: result.message, blueprint_id: result.blueprint_id }, null, 2) }] };
  }),
);

// ── Phase 11: Pulse Tools ───────────────────────────────────────────

server.tool(
  "hive_flight_pulse",
  "Report incremental progress during a flight (step label, progress 0.0-1.0, message)",
  {
    flight_id: z.string().describe("The flight UUID to report progress on"),
    step: z.string().describe("Short label for current step (e.g., 'analyzing', 'implementing', 'testing')"),
    progress: z.number().min(0).max(1).describe("Progress fraction from 0.0 to 1.0"),
    message: z.string().optional().describe("Optional progress message with details"),
  },
  errorBoundary(async ({ flight_id, step, progress, message }) => {
    const result = reportPulse(flight_id, step, progress, message);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ recorded: true, step, progress }) }] };
  }),
);

server.tool(
  "hive_flight_progress",
  "Get latest pulses for a flight or all active flights in a swarm",
  {
    flight_id: z.string().optional().describe("Specific flight UUID"),
    swarm_id: z.string().optional().describe("Swarm ID to get all active flight pulses"),
  },
  errorBoundary(async ({ flight_id, swarm_id }) => {
    const result = getFlightProgress({ flight_id, swarm_id });
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.flights, null, 2) }] };
  }),
);

// ── Phase 11: Usage Tools ──────────────────────────────────────────

server.tool(
  "hive_swarm_usage",
  "Get token/cost breakdown for a swarm by bee, flight, and totals",
  { swarm_id: z.string().describe("The swarm ID to get usage for") },
  errorBoundary(async ({ swarm_id }) => {
    const result = getSwarmUsage(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
  }),
);

// ── Phase 11: Bee Stats Tools ──────────────────────────────────────

server.tool(
  "hive_bee_stats",
  "Get historical performance stats for a bee or all bees in a blueprint",
  {
    bee_id: z.string().optional().describe("Specific qualified bee ID (e.g., feature-dev_worker)"),
    blueprint_id: z.string().optional().describe("Blueprint ID to filter by"),
  },
  errorBoundary(async ({ bee_id, blueprint_id }) => {
    const result = getBeeStatsQuery(bee_id, blueprint_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.stats, null, 2) }] };
  }),
);

// ── Phase 12: Queue, Archive, Report, Storage, Config Tools ─────────

server.tool(
  "hive_queue_status",
  "Get queue depth, active flights per bee, concurrency utilization, and queued swarms",
  {},
  errorBoundary(async () => {
    const status = getQueueStatus();
    return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
  }),
);

server.tool(
  "hive_swarm_archive",
  "Archive a completed/failed/cancelled swarm to compressed storage and delete originals",
  { swarm_id: z.string().describe("The swarm ID to archive") },
  errorBoundary(async ({ swarm_id }) => {
    const result = archiveSwarm(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ message: result.message, archive_id: result.archive_id }, null, 2) }] };
  }),
);

server.tool(
  "hive_swarm_report",
  "Generate a structured JSON + markdown report for a swarm with timeline, cells, nectar, and analytics",
  {
    swarm_id: z.string().describe("The swarm ID to report on"),
    format: z.enum(["json", "markdown", "both"]).optional().describe("Output format (default: both)"),
  },
  errorBoundary(async ({ swarm_id, format }) => {
    const result = generateSwarmReport(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    const fmt = format ?? "both";
    if (fmt === "json") {
      return { content: [{ type: "text" as const, text: JSON.stringify(result.report, null, 2) }] };
    }
    if (fmt === "markdown") {
      return { content: [{ type: "text" as const, text: result.markdown }] };
    }
    return { content: [{ type: "text" as const, text: result.markdown + "\n\n---\n\n```json\n" + JSON.stringify(result.report, null, 2) + "\n```" }] };
  }),
);

server.tool(
  "hive_storage_status",
  "Get DB file size, table counts, retention status, and archivable swarm count",
  {},
  errorBoundary(async () => {
    const status = getStorageStatus();
    return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
  }),
);

server.tool(
  "hive_config",
  "Get or set global configuration (concurrency limits, retention, defaults)",
  {
    key: z.string().optional().describe("Config key to get/set (omit to list all)"),
    value: z.string().optional().describe("New value to set (omit to get current value)"),
  },
  errorBoundary(async ({ key, value }) => {
    if (key && value !== undefined) {
      const result = setGlobalConfig(key, value);
      if (!result.success) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ message: `Config "${key}" set to "${value}"`, ...result }, null, 2) }] };
    }
    const result = getGlobalConfig(key);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.config, null, 2) }] };
  }),
);

// ── Phase 13: Replay, Fleet Metrics, Maintenance, Export/Import ──────

server.tool(
  "hive_swarm_replay",
  "Re-run a completed/failed/cancelled swarm with same blueprint and task. Creates new independent swarm linked to original. Accepts optional overrides.",
  {
    swarm_id: z.string().describe("The swarm ID or number to replay"),
    task: z.string().optional().describe("Override the original task description"),
    variables: z.record(z.string(), z.string()).optional().describe("Override input variables"),
    priority: z.number().int().min(1).max(10).optional().describe("Override priority (1-10)"),
    reset_nectar: z.boolean().optional().describe("Start with clean nectar (ignore original nectar values)"),
  },
  errorBoundary(async ({ swarm_id, task, variables, priority, reset_nectar }) => {
    const result = replaySwarm(swarm_id, { task, variables, priority, reset_nectar });
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "hive_fleet_metrics",
  "Get aggregate statistics across all swarms: success rates, durations, blueprint popularity, daily trends, top bees. Covers configurable time window.",
  {
    period: z.enum(["7d", "30d", "90d", "all"]).optional().describe("Time window (default: 30d)"),
  },
  errorBoundary(async ({ period }) => {
    const result = getFleetMetrics(period);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.metrics, null, 2) }] };
  }),
);

server.tool(
  "hive_maintain",
  "Run data maintenance to clean up old events, traces, beekeeper checks, and webhook deliveries. Respects per-table retention settings. Never deletes active swarm data.",
  {
    dry_run: z.boolean().optional().describe("Preview what would be deleted without actually deleting (default: false)"),
  },
  errorBoundary(async ({ dry_run }) => {
    const result = runMaintenance(dry_run ?? false);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "hive_blueprint_export",
  "Export an installed blueprint as a portable .hive-blueprint.json package with YAML, bee identity files, and manifest.",
  {
    blueprint_id: z.string().describe("The blueprint ID to export"),
    output_dir: z.string().optional().describe("Directory to write the bundle file (default: current directory)"),
  },
  errorBoundary(async ({ blueprint_id, output_dir }) => {
    const result = exportBlueprint(blueprint_id, output_dir);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "hive_blueprint_import",
  "Import a blueprint from a .hive-blueprint.json package file. Validates manifest and schema before installing.",
  {
    path: z.string().describe("Path to the .hive-blueprint.json file"),
  },
  errorBoundary(async ({ path }) => {
    const result = importBlueprint(path);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }),
);

// ── Phase 14: Estimation Tools ──────────────────────────────────────

server.tool(
  "hive_swarm_estimate",
  "Predict cost and duration for a swarm before starting it, using historical bee_stats and fleet data",
  {
    blueprint_id: z.string().describe("The blueprint ID to estimate"),
    variables: z.record(z.string(), z.string()).optional().describe("Optional input variables"),
  },
  errorBoundary(async ({ blueprint_id, variables }) => {
    const result = estimateSwarm(blueprint_id, variables);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.estimate, null, 2) }] };
  }),
);

// ── Phase 14: Gate Policy Tools ─────────────────────────────────────

server.tool(
  "hive_gate_list",
  "List all pending gated flights with policy details and timeout countdowns",
  {},
  errorBoundary(async () => {
    const gated = db.getGatedFlightsAll();
    const gates = gated.map(f => {
      const policy = f.gate ? (() => {
        const spec = parseGateSpec(f.gate!);
        return resolveGatePolicy(spec);
      })() : { type: "approval" as const };

      let timeoutInfo: { timeout_minutes: number; elapsed_minutes: number; remaining_minutes: number } | null = null;
      if ((policy as GatePolicy).timeout_minutes && f.gated_at) {
        const elapsedMs = Date.now() - new Date(f.gated_at.replace(" ", "T") + "Z").getTime();
        const elapsed = Math.round(elapsedMs / 60000);
        const timeout = (policy as GatePolicy).timeout_minutes!;
        timeoutInfo = { timeout_minutes: timeout, elapsed_minutes: elapsed, remaining_minutes: Math.max(0, timeout - elapsed) };
      }

      return {
        flight_uuid: f.id,
        flight_id: f.flight_id,
        swarm_id: f.swarm_id,
        bee_id: f.bee_id,
        policy,
        gated_at: f.gated_at,
        timeout: timeoutInfo,
      };
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(gates, null, 2) }] };
  }),
);

// ── Phase 14: Adaptive Tuning Tools ─────────────────────────────────

server.tool(
  "hive_adaptive_tune",
  "Analyze bee performance and recommend parameter adjustments. Use apply=true to mutate the blueprint.",
  {
    blueprint_id: z.string().describe("The blueprint ID to analyze"),
    apply: z.boolean().optional().describe("Apply recommendations to the blueprint (default: false)"),
  },
  errorBoundary(async ({ blueprint_id, apply }) => {
    const result = analyzeTuning(blueprint_id, apply ?? false);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.report, null, 2) }] };
  }),
);

// ── Phase 14: Nectar Injection Tools ────────────────────────────────

server.tool(
  "hive_nectar_set",
  "Manually set or override a nectar key on a swarm for debugging or intervention",
  {
    swarm_id: z.string().describe("The swarm ID"),
    key: z.string().describe("The nectar key to set"),
    value: z.string().describe("The value to set"),
  },
  errorBoundary(async ({ swarm_id, key, value }) => {
    const result = setNectarKey(swarm_id, key, value);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }),
);

server.tool(
  "hive_nectar_get",
  "Get nectar values for a swarm — all keys or a single key",
  {
    swarm_id: z.string().describe("The swarm ID"),
    key: z.string().optional().describe("Optional specific key to retrieve"),
  },
  errorBoundary(async ({ swarm_id, key }) => {
    const result = getNectar(swarm_id, key);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }),
);

// ── Phase 14: Blueprint Versioning Tools ────────────────────────────

server.tool(
  "hive_blueprint_history",
  "View the version history of a blueprint with install dates and change summaries",
  {
    blueprint_id: z.string().describe("The blueprint ID"),
  },
  errorBoundary(async ({ blueprint_id }) => {
    const result = getBlueprintHistory(blueprint_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.versions, null, 2) }] };
  }),
);

server.tool(
  "hive_blueprint_diff",
  "Show structural diff between two versions of a blueprint (bees/flights added, removed, changed)",
  {
    blueprint_id: z.string().describe("The blueprint ID"),
    from_version: z.number().int().positive().optional().describe("Starting version number (defaults to second-to-last)"),
    to_version: z.number().int().positive().optional().describe("Ending version number (defaults to latest)"),
  },
  errorBoundary(async ({ blueprint_id, from_version, to_version }) => {
    const result = diffBlueprintVersions(blueprint_id, from_version, to_version);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.diff, null, 2) }] };
  }),
);

// ── Phase 15: Budget Tools ───────────────────────────────────────────

server.tool(
  "hive_budget_set",
  "Set or update the token budget for a swarm. Configurable action on exceed: warn (default), pause, or cancel.",
  {
    swarm_id: z.string().describe("The swarm ID"),
    token_budget: z.number().int().min(0).describe("Token limit (0 = unlimited)"),
    action: z.enum(["warn", "pause", "cancel"]).optional().describe("Action when budget exceeded (default: warn)"),
  },
  errorBoundary(async ({ swarm_id, token_budget, action }) => {
    const result = setBudget(swarm_id, token_budget, action);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }),
);

server.tool(
  "hive_budget_status",
  "Check budget utilization, remaining tokens, and projected total for a swarm",
  {
    swarm_id: z.string().describe("The swarm ID"),
  },
  errorBoundary(async ({ swarm_id }) => {
    const result = getBudgetStatus(swarm_id);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.status, null, 2) }] };
  }),
);

// ── Phase 15: Cache Tools ───────────────────────────────────────────

server.tool(
  "hive_cache_status",
  "View flight result cache statistics: entries, hit rate, TTL, and expired count",
  {},
  errorBoundary(async () => {
    const stats = getCacheStatus();
    return { content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }] };
  }),
);

server.tool(
  "hive_cache_clear",
  "Invalidate cached flight results. Clear all, by blueprint, or by specific flight.",
  {
    blueprint_id: z.string().optional().describe("Filter by blueprint ID"),
    flight_id: z.string().optional().describe("Filter by flight ID (requires blueprint_id)"),
  },
  errorBoundary(async ({ blueprint_id, flight_id }) => {
    const result = clearCache(blueprint_id, flight_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }),
);

// ── Phase 15: Comparison Tools ──────────────────────────────────────

server.tool(
  "hive_swarm_compare",
  "Compare two swarm runs side-by-side: flight outcomes, durations, nectar diffs, and token usage. Works with live swarms and archives.",
  {
    swarm_a: z.string().describe("First swarm ID or number"),
    swarm_b: z.string().describe("Second swarm ID or number"),
  },
  errorBoundary(async ({ swarm_a, swarm_b }) => {
    const result = compareSwarms(swarm_a, swarm_b);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: result.comparison.markdown + "\n\n---\n\n```json\n" + JSON.stringify(result.comparison, null, 2) + "\n```" }] };
  }),
);

// ── Phase 15: Dynamic Pipeline Tools ────────────────────────────────

server.tool(
  "hive_flight_inject",
  "Inject a new flight into a running pipeline after a specified flight. Safety guards prevent modifying completed or in-flight work.",
  {
    swarm_id: z.string().describe("The swarm ID"),
    after_flight_id: z.string().describe("Insert after this flight ID"),
    bee_id: z.string().describe("The bee ID to assign (e.g., feature-dev_worker)"),
    input: z.string().describe("The input template for the injected flight"),
    expects: z.string().optional().describe("Expected output format (default: STATUS: done)"),
  },
  errorBoundary(async ({ swarm_id, after_flight_id, bee_id, input, expects }) => {
    const result = injectFlight(swarm_id, after_flight_id, bee_id, input, expects);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }),
);

server.tool(
  "hive_flight_skip",
  "Skip a pending or waiting flight, marking it done with SKIPPED output. Advances the pipeline.",
  {
    flight_id: z.string().describe("The flight UUID to skip"),
    reason: z.string().optional().describe("Reason for skipping (default: manually skipped)"),
  },
  errorBoundary(async ({ flight_id, reason }) => {
    const result = skipFlight(flight_id, reason);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }),
);

// ── Phase 15: Template Tools ────────────────────────────────────────

server.tool(
  "hive_template_save",
  "Save a named swarm configuration as a reusable template. Stores blueprint, variables, priority, and description.",
  {
    name: z.string().describe("Unique template name"),
    blueprint_id: z.string().describe("The blueprint ID to use"),
    variables: z.record(z.string(), z.string()).optional().describe("Default input variables"),
    priority: z.number().int().min(1).max(10).optional().describe("Default priority (1-10)"),
    description: z.string().optional().describe("Template description"),
  },
  errorBoundary(async ({ name, blueprint_id, variables, priority, description }) => {
    const result = saveTemplate(name, blueprint_id, description, variables, priority);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }),
);

server.tool(
  "hive_template_list",
  "List all saved swarm templates with usage counts",
  {},
  errorBoundary(async () => {
    const result = listSavedTemplates();
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.templates, null, 2) }] };
  }),
);

server.tool(
  "hive_template_run",
  "Start a swarm from a saved template with optional task and variable overrides",
  {
    template_name: z.string().describe("The template name to use"),
    task: z.string().describe("The task description"),
    variables: z.record(z.string(), z.string()).optional().describe("Variable overrides"),
    priority: z.number().int().min(1).max(10).optional().describe("Priority override"),
  },
  errorBoundary(async ({ template_name, task, variables, priority }) => {
    const result = runTemplate(template_name, task, variables, priority);
    if (!result.success) {
      return { content: [{ type: "text" as const, text: result.error }], isError: true };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result.result, null, 2) }] };
  }),
);

// ── Observatory Tools ────────────────────────────────────────────────

server.tool(
  "hive_observatory_start",
  "Start the Observatory dashboard HTTP server",
  { port: z.number().optional().describe("Port to listen on (default: 4242)") },
  async ({ port }) => {
    try {
      const status = await startObservatory(port);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ message: `Observatory running at ${status.url}`, ...status }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to start Observatory: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "hive_observatory_stop",
  "Stop the Observatory dashboard HTTP server",
  {},
  async () => {
    const status = stopObservatory();
    return {
      content: [{ type: "text", text: JSON.stringify({ message: "Observatory stopped", ...status }) }],
    };
  },
);

server.tool(
  "hive_observatory_status",
  "Check if the Observatory dashboard is running",
  {},
  async () => {
    const status = getObservatoryStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
    };
  },
);

// ── Phase 16: Intelligence Tools ─────────────────────────────────────

server.tool(
  "hive_swarm_dag",
  "Get DAG visualization of a swarm's flight dependency graph, including nodes, edges, critical path, and parallelism ratio",
  { query: z.string().describe("Swarm number, ID, or UUID") },
  errorBoundary(async ({ query }) => {
    const swarm = db.findSwarm(query);
    if (!swarm) return { content: [{ type: "text" as const, text: `Swarm "${query}" not found` }], isError: true };
    const result = computeDAG(swarm.id);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(result.dag, null, 2) }] };
  }),
);

server.tool(
  "hive_subswarm_status",
  "Get status of a sub-swarm launched by a parent flight, including child swarm details and flight progress",
  { flight_id: z.string().describe("Parent flight UUID") },
  errorBoundary(async ({ flight_id }) => {
    const result = getSubSwarmStatus(flight_id);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error ?? "Unknown error" }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
  }),
);

server.tool(
  "hive_routing_history",
  "View model routing decisions for a swarm or globally, showing which models were selected and why",
  {
    swarm_id: z.string().optional().describe("Filter by swarm ID"),
    limit: z.number().optional().describe("Max results (default 50)"),
  },
  errorBoundary(async ({ swarm_id, limit }) => {
    const history = getRoutingHistory(swarm_id, limit ?? 50);
    return { content: [{ type: "text" as const, text: JSON.stringify(history, null, 2) }] };
  }),
);

server.tool(
  "hive_anomaly_alerts",
  "List anomaly alerts detected by baseline analysis, with optional filters for swarm and acknowledgment status",
  {
    swarm_id: z.string().optional().describe("Filter by swarm ID"),
    acknowledged: z.boolean().optional().describe("Filter by acknowledged status"),
    limit: z.number().optional().describe("Max results (default 50)"),
  },
  errorBoundary(async ({ swarm_id, acknowledged, limit }) => {
    const alerts = getAlerts({ swarm_id, acknowledged, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(alerts, null, 2) }] };
  }),
);

server.tool(
  "hive_anomaly_acknowledge",
  "Acknowledge an anomaly alert to mark it as reviewed",
  { alert_id: z.string().describe("Alert UUID to acknowledge") },
  errorBoundary(async ({ alert_id }) => {
    const result = acknowledgeAlert(alert_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: !result.success };
  }),
);

server.tool(
  "hive_anomaly_baselines",
  "View computed baselines for a blueprint's flights (mean, stddev, sample count per metric)",
  { blueprint_id: z.string().describe("Blueprint ID") },
  errorBoundary(async ({ blueprint_id }) => {
    const baselines = getBaselines(blueprint_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(baselines, null, 2) }] };
  }),
);

// ── Phase 17: Connectivity Tools ─────────────────────────────────────

server.tool(
  "hive_stream_status",
  "Get status of the SSE event stream, including connected client count and their filters",
  {},
  errorBoundary(async () => {
    const status = getStreamStatus();
    return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
  }),
);

server.tool(
  "hive_nectar_shares",
  "List cross-swarm nectar shares for a swarm, showing resolved values from other swarms",
  { swarm_id: z.string().describe("Target swarm ID") },
  errorBoundary(async ({ swarm_id }) => {
    const shares = getNectarShares(swarm_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(shares, null, 2) }] };
  }),
);

server.tool(
  "hive_nectar_resolve",
  "Manually resolve a nectar value from a source swarm",
  {
    source_swarm_id: z.string().describe("Source swarm ID"),
    from_key: z.string().describe("Key to look up in source swarm nectar"),
  },
  errorBoundary(async ({ source_swarm_id, from_key }) => {
    const result = manualResolve(source_swarm_id, from_key);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify({ value: result.value }) }] };
  }),
);

server.tool(
  "hive_registry_search",
  "Search the blueprint registry for community blueprints. Syncs with remote registry if cache is stale.",
  {
    query: z.string().describe("Search query"),
    registry_url: z.string().optional().describe("Override registry URL"),
    sync: z.boolean().optional().describe("Force sync before search (default false)"),
  },
  errorBoundary(async ({ query, registry_url, sync }) => {
    if (sync) {
      const syncResult = await syncRegistry(registry_url);
      if (!syncResult.success) return { content: [{ type: "text" as const, text: syncResult.error }], isError: true };
    }
    const results = searchRegistryFn(query, registry_url);
    return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
  }),
);

server.tool(
  "hive_registry_install",
  "Install a blueprint from the registry into the local hive",
  {
    blueprint_id: z.string().describe("Blueprint ID to install from registry"),
    registry_url: z.string().optional().describe("Override registry URL"),
  },
  errorBoundary(async ({ blueprint_id, registry_url }) => {
    const result = await installFromRegistry(blueprint_id, registry_url);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify({ installed: result.installed }) }] };
  }),
);

server.tool(
  "hive_blueprint_rate",
  "Rate a blueprint (1-5 stars) with an optional comment",
  {
    blueprint_id: z.string().describe("Blueprint ID to rate"),
    rating: z.number().int().min(1).max(5).describe("Rating 1-5"),
    comment: z.string().optional().describe("Optional review comment"),
  },
  errorBoundary(async ({ blueprint_id, rating, comment }) => {
    const result = rateBlueprint(blueprint_id, rating, comment);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(result.rating, null, 2) }] };
  }),
);

server.tool(
  "hive_channel_create",
  "Create a notification channel for event delivery (webhook, Slack, Discord, or PagerDuty)",
  {
    name: z.string().describe("Channel display name"),
    type: z.enum(["webhook", "slack", "discord", "pagerduty"]).describe("Channel type"),
    config: z.string().describe("JSON config for channel (e.g. {\"webhook_url\": \"...\", \"channel\": \"#alerts\"})"),
  },
  errorBoundary(async ({ name, type, config }) => {
    const parsed = safeJsonParse(config, null);
    if (!parsed) return { content: [{ type: "text" as const, text: "Invalid JSON config" }], isError: true };
    const result = createChannel(name, type as NotificationChannelType, parsed);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(result.channel, null, 2) }] };
  }),
);

server.tool(
  "hive_channel_list",
  "List all notification channels",
  {},
  errorBoundary(async () => {
    const channels = listChannels();
    return { content: [{ type: "text" as const, text: JSON.stringify(channels, null, 2) }] };
  }),
);

server.tool(
  "hive_channel_delete",
  "Delete a notification channel and all its routes",
  { channel_id: z.string().describe("Channel UUID to delete") },
  errorBoundary(async ({ channel_id }) => {
    const result = deleteChannel(channel_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: !result.success };
  }),
);

server.tool(
  "hive_route_create",
  "Create a notification route that maps event patterns (glob) to channels",
  {
    event_pattern: z.string().describe("Event glob pattern (e.g. 'swarm.*', 'flight.failed', 'anomaly.*')"),
    channel_id: z.string().describe("Channel UUID to route to"),
    priority: z.number().optional().describe("Route priority (higher = first, default 0)"),
  },
  errorBoundary(async ({ event_pattern, channel_id, priority }) => {
    const result = createRoute(event_pattern, channel_id, priority);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify(result.route, null, 2) }] };
  }),
);

server.tool(
  "hive_route_list",
  "List all notification routes",
  {},
  errorBoundary(async () => {
    const routes = listRoutes();
    return { content: [{ type: "text" as const, text: JSON.stringify(routes, null, 2) }] };
  }),
);

server.tool(
  "hive_route_delete",
  "Delete a notification route",
  { route_id: z.string().describe("Route UUID to delete") },
  errorBoundary(async ({ route_id }) => {
    const result = deleteRoute(route_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: !result.success };
  }),
);

server.tool(
  "hive_webhook_token_create",
  "Create an inbound webhook authentication token with specific permissions",
  {
    name: z.string().describe("Token display name"),
    permissions: z.array(z.enum(["swarm:start", "gate:approve", "nectar:set", "swarm:stop"])).describe("Permissions to grant"),
    expires_at: z.string().optional().describe("ISO 8601 expiration timestamp"),
  },
  errorBoundary(async ({ name, permissions, expires_at }) => {
    const result = createToken(name, permissions as InboundWebhookPermission[], expires_at);
    if (!result.success) return { content: [{ type: "text" as const, text: result.error }], isError: true };
    return { content: [{ type: "text" as const, text: JSON.stringify({ token: result.token, record: result.record }, null, 2) }] };
  }),
);

server.tool(
  "hive_webhook_token_list",
  "List all active (non-revoked) inbound webhook tokens",
  {},
  errorBoundary(async () => {
    const tokens = listTokens();
    return { content: [{ type: "text" as const, text: JSON.stringify(tokens, null, 2) }] };
  }),
);

server.tool(
  "hive_webhook_token_revoke",
  "Revoke an inbound webhook token",
  { token_id: z.string().describe("Token UUID to revoke") },
  errorBoundary(async ({ token_id }) => {
    const result = revokeToken(token_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: !result.success };
  }),
);

server.tool(
  "hive_webhook_audit",
  "View inbound webhook audit log",
  {
    token_id: z.string().optional().describe("Filter by token ID"),
    limit: z.number().optional().describe("Max results (default 50)"),
  },
  errorBoundary(async ({ token_id, limit }) => {
    const log = getAuditLog({ token_id, limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(log, null, 2) }] };
  }),
);

// ── MCP Resources ────────────────────────────────────────────────────

server.resource(
  "active-swarms",
  "hive://swarms/active",
  async () => {
    const swarms = db.listSwarms({ status: "buzzing" });
    return {
      contents: [{
        uri: "hive://swarms/active",
        text: JSON.stringify(swarms.map(s => ({
          number: s.swarm_number,
          blueprint: s.blueprint_id,
          task: s.task,
          created: s.created_at,
        })), null, 2),
      }],
    };
  },
);

server.resource(
  "blueprints",
  "hive://blueprints",
  async () => {
    const installed = db.listBlueprints();
    return {
      contents: [{
        uri: "hive://blueprints",
        text: JSON.stringify(installed.map(b => ({
          id: b.id,
          name: b.name,
          version: b.version,
        })), null, 2),
      }],
    };
  },
);

// ── Resource Templates ──────────────────────────────────────────────

server.resource(
  "swarm-status",
  new ResourceTemplate("hive://swarm/{id}/status", {
    list: async () => {
      const buzzing = db.listSwarms({ status: "buzzing" });
      return {
        resources: buzzing.map(s => ({
          uri: `hive://swarm/${s.id}/status`,
          name: `Swarm #${s.swarm_number} status`,
        })),
      };
    },
  }),
  async (uri, variables) => {
    const id = String(variables.id);
    const swarm = db.findSwarm(id);
    if (!swarm) {
      return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "Swarm not found" }) }] };
    }
    const flights = db.getFlightsForSwarm(swarm.id);
    const cells = db.getCellsForSwarm(swarm.id);
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify({ swarm, flights, cells }, null, 2),
      }],
    };
  },
);

server.resource(
  "swarm-nectar",
  new ResourceTemplate("hive://swarm/{id}/nectar", {
    list: async () => {
      const buzzing = db.listSwarms({ status: "buzzing" });
      return {
        resources: buzzing.map(s => ({
          uri: `hive://swarm/${s.id}/nectar`,
          name: `Swarm #${s.swarm_number} nectar`,
        })),
      };
    },
  }),
  async (uri, variables) => {
    const id = String(variables.id);
    const swarm = db.findSwarm(id);
    if (!swarm) {
      return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "Swarm not found" }) }] };
    }
    const nectar = safeJsonParse(swarm.nectar, {});
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(nectar, null, 2),
      }],
    };
  },
);

server.resource(
  "beekeeper-health",
  "hive://beekeeper/health",
  async () => {
    const checks = db.getRecentBeekeeperChecks(1);
    const stuck = db.getStuckFlights(35);
    const stalled = db.getStalledSwarms(30);
    return {
      contents: [{
        uri: "hive://beekeeper/health",
        text: JSON.stringify({
          latest_check: checks[0] ?? null,
          current_stuck_flights: stuck.length,
          current_stalled_swarms: stalled.length,
        }, null, 2),
      }],
    };
  },
);

// ── Phase 11: Resource Templates ────────────────────────────────────

server.resource(
  "swarm-pulses",
  new ResourceTemplate("hive://swarm/{id}/pulses", {
    list: async () => {
      const buzzing = db.listSwarms({ status: "buzzing" });
      return {
        resources: buzzing.map(s => ({
          uri: `hive://swarm/${s.id}/pulses`,
          name: `Swarm #${s.swarm_number} pulses`,
        })),
      };
    },
  }),
  async (uri, variables) => {
    const id = String(variables.id);
    const swarm = db.findSwarm(id);
    if (!swarm) {
      return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "Swarm not found" }) }] };
    }
    const pulses = db.getPulsesForSwarm(swarm.id);
    return { contents: [{ uri: uri.href, text: JSON.stringify(pulses, null, 2) }] };
  },
);

server.resource(
  "swarm-usage",
  new ResourceTemplate("hive://swarm/{id}/usage", {
    list: async () => {
      const all = db.listSwarms({ limit: 20 });
      return {
        resources: all.map(s => ({
          uri: `hive://swarm/${s.id}/usage`,
          name: `Swarm #${s.swarm_number} usage`,
        })),
      };
    },
  }),
  async (uri, variables) => {
    const id = String(variables.id);
    const swarm = db.findSwarm(id);
    if (!swarm) {
      return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "Swarm not found" }) }] };
    }
    const usage = db.getUsageForSwarm(swarm.id);
    return { contents: [{ uri: uri.href, text: JSON.stringify(usage, null, 2) }] };
  },
);

server.resource(
  "swarm-events",
  new ResourceTemplate("hive://swarm/{id}/events", {
    list: async () => {
      const buzzing = db.listSwarms({ status: "buzzing" });
      return {
        resources: buzzing.map(s => ({
          uri: `hive://swarm/${s.id}/events`,
          name: `Swarm #${s.swarm_number} events`,
        })),
      };
    },
  }),
  async (uri, variables) => {
    const id = String(variables.id);
    const swarm = db.findSwarm(id);
    if (!swarm) {
      return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "Swarm not found" }) }] };
    }
    const events = db.getEventsForSwarm(swarm.id, 50);
    return { contents: [{ uri: uri.href, text: JSON.stringify(events, null, 2) }] };
  },
);

server.resource(
  "swarm-flights",
  new ResourceTemplate("hive://swarm/{id}/flights", {
    list: async () => {
      const buzzing = db.listSwarms({ status: "buzzing" });
      return {
        resources: buzzing.map(s => ({
          uri: `hive://swarm/${s.id}/flights`,
          name: `Swarm #${s.swarm_number} flights`,
        })),
      };
    },
  }),
  async (uri, variables) => {
    const id = String(variables.id);
    const swarm = db.findSwarm(id);
    if (!swarm) {
      return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "Swarm not found" }) }] };
    }
    const flights = db.getFlightsForSwarm(swarm.id);
    const detailed = flights.map(f => ({
      id: f.flight_id,
      bee: f.bee_id,
      status: f.status,
      type: f.type,
      started_at: f.started_at,
      completed_at: f.completed_at,
      retry_count: f.retry_count,
    }));
    return { contents: [{ uri: uri.href, text: JSON.stringify(detailed, null, 2) }] };
  },
);

server.resource(
  "bee-stats",
  "hive://bees/stats",
  async () => {
    const stats = db.getAllBeeStats();
    return {
      contents: [{
        uri: "hive://bees/stats",
        text: JSON.stringify(stats, null, 2),
      }],
    };
  },
);

// ── Start Server ─────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("Hive MCP server connected");
