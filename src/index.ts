import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb } from "./db.js";
import * as db from "./db.js";
import { discoverBundledBlueprints, discoverInstalledBlueprints, loadBlueprint } from "./blueprint/loader.js";
import { logger } from "./lib/logger.js";

// ── Initialize ───────────────────────────────────────────────────────

initDb();
logger.info("Hive MCP server starting");

const server = new McpServer({
  name: "hive",
  version: "0.1.0",
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
    // Verify blueprint is installed
    const bp = db.getBlueprint(blueprint_id);
    if (!bp) {
      return { content: [{ type: "text", text: `Blueprint "${blueprint_id}" is not installed. Use hive_blueprint_install first.` }], isError: true };
    }

    const spec = JSON.parse(bp.spec);
    const nectar: Record<string, string> = { task, ...(spec.nectar ?? {}) };
    const swarm = db.createSwarm(blueprint_id, task, nectar, spec.notifications?.url);

    // Insert flights from blueprint
    for (let i = 0; i < spec.flights.length; i++) {
      const flight = spec.flights[i];
      const beeId = `${blueprint_id}_${flight.bee}`;
      const status = i === 0 ? "pending" : "waiting";
      db.insertFlight(
        swarm.id,
        flight.id,
        beeId,
        i,
        flight.input,
        flight.expects,
        status,
        flight.max_retries ?? 2,
        flight.type ?? "single",
        flight.loop ? JSON.stringify(flight.loop) : undefined,
      );
    }

    db.insertEvent("swarm.started", swarm.id, { blueprint_id, task });
    logger.info("Swarm started", { swarmId: swarm.id, swarmNumber: swarm.swarm_number, blueprint_id });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          message: `Swarm #${swarm.swarm_number} started`,
          swarm: {
            id: swarm.id,
            number: swarm.swarm_number,
            blueprint: blueprint_id,
            task,
            status: swarm.status,
            flights: spec.flights.length,
          },
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
    const swarm = db.findSwarm(query);
    if (!swarm) {
      return { content: [{ type: "text", text: `No swarm found matching "${query}"` }], isError: true };
    }
    const flights = db.getFlightsForSwarm(swarm.id);
    const cells = db.getCellsForSwarm(swarm.id);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          swarm: {
            id: swarm.id,
            number: swarm.swarm_number,
            blueprint: swarm.blueprint_id,
            task: swarm.task,
            status: swarm.status,
            created_at: swarm.created_at,
          },
          flights: flights.map(f => ({
            id: f.flight_id,
            bee: f.bee_id,
            status: f.status,
            type: f.type,
            retries: f.retry_count,
          })),
          cells: cells.length > 0 ? cells.map(c => ({
            id: c.cell_id,
            title: c.title,
            status: c.status,
          })) : undefined,
        }, null, 2),
      }],
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
    const swarm = db.getSwarm(swarm_id);
    if (!swarm) {
      return { content: [{ type: "text", text: `Swarm "${swarm_id}" not found` }], isError: true };
    }
    if (swarm.status !== "buzzing" && swarm.status !== "paused") {
      return { content: [{ type: "text", text: `Swarm is already ${swarm.status}` }], isError: true };
    }
    db.updateSwarm(swarm_id, { status: "cancelled" });
    db.insertEvent("swarm.cancelled", swarm_id);
    logger.info("Swarm cancelled", { swarmId: swarm_id });
    return {
      content: [{ type: "text", text: `Swarm #${swarm.swarm_number} cancelled` }],
    };
  },
);

// ── Flight Tools ─────────────────────────────────────────────────────

server.tool(
  "hive_flight_peek",
  "Check if a bee has pending work (lightweight check)",
  { bee_id: z.string().describe("The bee ID to check (format: blueprintId_beeId)") },
  async ({ bee_id }) => {
    const count = db.peekFlightsForBee(bee_id);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          bee_id,
          has_work: count > 0,
          pending_count: count,
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
    const flight = db.claimFlightForBee(bee_id);
    if (!flight) {
      return {
        content: [{ type: "text", text: JSON.stringify({ bee_id, claimed: false, message: "No pending flights" }) }],
      };
    }

    // Resolve nectar template
    const swarm = db.getSwarm(flight.swarm_id)!;
    const nectar = JSON.parse(swarm.nectar) as Record<string, string>;
    nectar.swarm_id = swarm.id;

    // For loop flights, include cell context
    let cell;
    if (flight.type === "loop") {
      const nextCell = db.getNextPendingCell(flight.swarm_id);
      if (nextCell) {
        db.updateCell(nextCell.id, { status: "in_progress" });
        db.updateFlight(flight.id, { current_cell_id: nextCell.id });
        nectar.current_cell = `${nextCell.title}: ${nextCell.description}`;
        nectar.acceptance_criteria = nextCell.acceptance_criteria;
        cell = {
          id: nextCell.id,
          cell_id: nextCell.cell_id,
          title: nextCell.title,
          description: nextCell.description,
          acceptance_criteria: JSON.parse(nextCell.acceptance_criteria),
        };

        // Add completed cells context
        const allCells = db.getCellsForSwarm(flight.swarm_id);
        const completed = allCells.filter(c => c.status === "done");
        const remaining = allCells.filter(c => c.status === "pending" || c.status === "in_progress");
        nectar.completed_cells = completed.map(c => c.title).join(", ") || "none";
        nectar.cells_remaining = String(remaining.length);
      }
    }

    // Compute progress
    const flights = db.getFlightsForSwarm(flight.swarm_id);
    const done = flights.filter(f => f.status === "done").length;
    nectar.progress = `Flight ${done + 1}/${flights.length}`;

    // Resolve template
    let resolvedInput = flight.input_template;
    resolvedInput = resolvedInput.replace(/\{\{(\w+)\}\}/g, (_, key) => nectar[key] ?? `{{${key}}}`);
    resolvedInput = resolvedInput.replace(
      /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
      (_, key, content) => nectar[key] ? content : "",
    );

    db.insertEvent("flight.claimed", swarm.id, { flight_id: flight.flight_id, bee_id });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          claimed: true,
          flight_id: flight.id,
          swarm_id: flight.swarm_id,
          resolved_input: resolvedInput,
          expects: flight.expects,
          type: flight.type,
          cell,
        }, null, 2),
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
    const flight = db.getFlight(flight_id);
    if (!flight) {
      return { content: [{ type: "text", text: `Flight "${flight_id}" not found` }], isError: true };
    }
    if (flight.status !== "in_flight") {
      return { content: [{ type: "text", text: `Flight is not in_flight (current: ${flight.status})` }], isError: true };
    }

    // Parse KEY: value lines from output into nectar
    const swarm = db.getSwarm(flight.swarm_id)!;
    const nectar = JSON.parse(swarm.nectar) as Record<string, string>;
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+):\s*(.+)$/);
      if (match) {
        const key = match[1].toLowerCase();
        nectar[key] = match[2].trim();
      }
    }
    db.updateSwarm(flight.swarm_id, { nectar: JSON.stringify(nectar) });

    // Handle loop flights with cells
    if (flight.type === "loop" && flight.current_cell_id) {
      db.updateCell(flight.current_cell_id, { status: "done", output });

      // Check if more cells remain
      const nextCell = db.getNextPendingCell(flight.swarm_id);
      if (nextCell) {
        // Keep flight as pending for next cell
        db.updateFlight(flight_id, { status: "pending", output, current_cell_id: null });
        db.insertEvent("cell.completed", flight.swarm_id, { cell_id: flight.current_cell_id });
      } else {
        // All cells done, complete the flight
        db.updateFlight(flight_id, { status: "done", output, current_cell_id: null });
        db.insertEvent("flight.completed", flight.swarm_id, { flight_id: flight.flight_id });
        advancePipeline(flight.swarm_id);
      }
    } else {
      // Single flight — just mark done and advance
      db.updateFlight(flight_id, { status: "done", output });
      db.insertEvent("flight.completed", flight.swarm_id, { flight_id: flight.flight_id });
      advancePipeline(flight.swarm_id);
    }

    logger.info("Flight completed", { flightId: flight_id, flightName: flight.flight_id });
    return {
      content: [{ type: "text", text: `Flight "${flight.flight_id}" completed` }],
    };
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
    const flight = db.getFlight(flight_id);
    if (!flight) {
      return { content: [{ type: "text", text: `Flight "${flight_id}" not found` }], isError: true };
    }

    // Handle cell failure for loop flights
    if (flight.type === "loop" && flight.current_cell_id) {
      const cell = db.getCell(flight.current_cell_id);
      if (cell && cell.retry_count < cell.max_retries) {
        db.updateCell(cell.id, { status: "pending", retry_count: cell.retry_count + 1 });
        db.updateFlight(flight_id, { status: "pending", current_cell_id: null });
        db.insertEvent("cell.failed", flight.swarm_id, { cell_id: cell.id, error, retrying: true });
        return {
          content: [{ type: "text", text: `Cell "${cell.cell_id}" failed, retrying (attempt ${cell.retry_count + 1}/${cell.max_retries})` }],
        };
      }
    }

    // Check retries for the flight itself
    if (flight.retry_count < flight.max_retries) {
      db.updateFlight(flight_id, {
        status: "pending",
        retry_count: flight.retry_count + 1,
        current_cell_id: null,
      });
      db.insertEvent("flight.failed", flight.swarm_id, { flight_id: flight.flight_id, error, retrying: true });
      return {
        content: [{ type: "text", text: `Flight "${flight.flight_id}" failed, retrying (attempt ${flight.retry_count + 1}/${flight.max_retries})` }],
      };
    }

    // No retries left — fail the flight and the swarm
    db.updateFlight(flight_id, { status: "failed", output: error, current_cell_id: null });
    db.updateSwarm(flight.swarm_id, { status: "failed" });
    db.insertEvent("flight.failed", flight.swarm_id, { flight_id: flight.flight_id, error, retrying: false });
    db.insertEvent("swarm.failed", flight.swarm_id, { reason: `Flight "${flight.flight_id}" exhausted retries` });

    logger.error("Flight failed permanently", { flightId: flight_id, error });
    return {
      content: [{ type: "text", text: `Flight "${flight.flight_id}" failed permanently. Swarm marked as failed.` }],
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

    // Check for stuck flights
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

    // Check for stalled swarms
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
      content: [{
        type: "text",
        text: JSON.stringify(checks, null, 2),
      }],
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

// ── Pipeline Helper ──────────────────────────────────────────────────

function advancePipeline(swarmId: string): void {
  const flights = db.getFlightsForSwarm(swarmId);

  // Check if all flights are done
  const allDone = flights.every(f => f.status === "done");
  if (allDone) {
    db.updateSwarm(swarmId, { status: "completed" });
    db.insertEvent("swarm.completed", swarmId);
    logger.info("Swarm completed", { swarmId });
    return;
  }

  // Check for failures
  const anyFailed = flights.some(f => f.status === "failed");
  if (anyFailed) {
    return; // Already handled in flight_fail
  }

  // Promote next waiting flight to pending
  for (const flight of flights) {
    if (flight.status === "waiting") {
      const prevIndex = flight.flight_index - 1;
      if (prevIndex < 0) {
        db.updateFlight(flight.id, { status: "pending" });
        db.insertEvent("flight.ready", swarmId, { flight_id: flight.flight_id });
        break;
      }
      const prevFlight = flights.find(f => f.flight_index === prevIndex);
      if (prevFlight && prevFlight.status === "done") {
        db.updateFlight(flight.id, { status: "pending" });
        db.insertEvent("flight.ready", swarmId, { flight_id: flight.flight_id });
        break;
      }
      break;
    }
  }
}

// ── Start Server ─────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("Hive MCP server connected");
