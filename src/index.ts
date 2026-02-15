import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb } from "./db.js";
import * as db from "./db.js";
import { discoverBundledBlueprints, loadBlueprint } from "./blueprint/loader.js";
import { logger } from "./lib/logger.js";

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
import type { BlueprintSpec } from "./types.js";

// ── Initialize ───────────────────────────────────────────────────────

initDb();
logger.info("Hive MCP server starting");

// Re-register buzzing swarms with the scheduler on startup
const buzzingSwarms = db.listSwarms({ status: "buzzing" });
for (const swarm of buzzingSwarms) {
  const bp = db.getBlueprint(swarm.blueprint_id);
  if (bp) {
    const spec: BlueprintSpec = JSON.parse(bp.spec);
    scheduler.registerSwarm(swarm.id, spec);
  }
}
if (buzzingSwarms.length > 0) {
  logger.info("Scheduler: re-registered buzzing swarms on startup", { count: buzzingSwarms.length });
}

const server = new McpServer({
  name: "hive",
  version: "0.2.0",
});

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
      const spec: BlueprintSpec = JSON.parse(bp.spec);
      scheduler.registerSwarm(result.data.id, spec);
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
    status: z.string().optional().describe("Filter by status: buzzing, completed, failed, cancelled"),
    limit: z.number().optional().describe("Max number of swarms to return"),
  },
  async ({ status, limit }) => {
    const swarms = db.listSwarms({
      status: status as any,
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
        const spec: BlueprintSpec = JSON.parse(bp.spec);
        scheduler.registerSwarm(swarm_id, spec);
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
    let issuesFound = 0;
    let actionsTaken = 0;
    const findings: string[] = [];

    const stuck = db.getStuckFlights(35);
    for (const flight of stuck) {
      issuesFound++;
      if (flight.abandoned_count < 5) {
        db.updateFlight(flight.id, {
          status: "pending",
          abandoned_count: flight.abandoned_count + 1,
          current_cell_id: null,
        });
        actionsTaken++;
        findings.push(`Reset stuck flight "${flight.flight_id}" (abandoned ${flight.abandoned_count + 1}/5)`);
      } else {
        findings.push(`Flight "${flight.flight_id}" exhausted abandon limit`);
      }
    }

    const stalled = db.getStalledSwarms(30);
    for (const swarm of stalled) {
      issuesFound++;
      findings.push(`Swarm #${swarm.swarm_number} stalled (no progress in 30+ minutes)`);
    }

    const summary = issuesFound === 0
      ? "Hive is healthy. All bees buzzing normally."
      : `Found ${issuesFound} issue(s), took ${actionsTaken} action(s).`;

    db.insertBeekeeperCheck(issuesFound, actionsTaken, summary, { findings });
    logger.info("Beekeeper check completed", { issuesFound, actionsTaken });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ summary, issues_found: issuesFound, actions_taken: actionsTaken, findings }, null, 2),
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

// ── Start Server ─────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("Hive MCP server connected");
