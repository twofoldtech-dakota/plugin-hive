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
import type { BlueprintSpec } from "./types.js";

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
  fn: (args: T) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>,
): (args: T) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
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

// ── Swarm Tools ──────────────────────────────────────────────────────

server.tool(
  "hive_swarm_start",
  "Start a new swarm from a blueprint to execute a task",
  {
    blueprint_id: z.string().describe("The blueprint ID to use"),
    task: z.string().describe("The task description for the swarm"),
  },
  async ({ blueprint_id, task }) => {
    const result = createSwarmFromBlueprint(blueprint_id, task);
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }

    // Register with scheduler
    const bp = db.getBlueprint(blueprint_id);
    if (bp) {
      const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
      if (spec) scheduler.registerSwarm(result.data.id, spec);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: `Swarm #${result.data.number} started`,
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
    status: z.enum(["buzzing", "paused", "blocked", "completed", "failed", "cancelled"]).optional().describe("Filter by status"),
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
  "Mark a flight as failed with an error message",
  {
    flight_id: z.string().describe("The flight UUID that failed"),
    error: z.string().describe("Error message describing the failure"),
  },
  async ({ flight_id, error }) => {
    const result = failFlight(flight_id, error);
    if (!result.success) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: result.message }] };
  },
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

// ── Start Server ─────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("Hive MCP server connected");
