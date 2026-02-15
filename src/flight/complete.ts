import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { advancePipeline } from "../pipeline/advance.js";
import { parseCellsJson } from "../cell/parse.js";
import { insertCellsFromParsed } from "../cell/manage.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import type { LoopConfig, BlueprintSpec, FlightRecord } from "../types.js";

export type CompleteFlightResult =
  | { success: true; message: string }
  | { success: false; error: string };

export function completeFlight(flightId: string, output: string): CompleteFlightResult {
  const flight = db.getFlight(flightId);
  if (!flight) {
    return { success: false, error: `Flight "${flightId}" not found` };
  }
  if (flight.status !== "in_flight") {
    return { success: false, error: `Flight is not in_flight (current: ${flight.status})` };
  }

  // ── Parse KEY: value lines from output into nectar ──────────────
  const swarm = db.getSwarm(flight.swarm_id)!;
  const nectar = safeJsonParse<Record<string, string>>(swarm.nectar, {});
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+):\s*(.+)$/);
    if (match) {
      const key = match[1].toLowerCase();
      nectar[key] = match[2].trim();
    }
  }
  db.updateSwarm(flight.swarm_id, { nectar: JSON.stringify(nectar) });

  // ── CELLS_JSON auto-parsing ─────────────────────────────────────
  if (nectar.cells_json) {
    const parseResult = parseCellsJson(output);
    if (parseResult.success) {
      insertCellsFromParsed(flight.swarm_id, parseResult.cells);
      logger.info("Auto-parsed CELLS_JSON", {
        swarmId: flight.swarm_id,
        cellCount: parseResult.cells.length,
      });
    } else {
      logger.warn("CELLS_JSON parse failed", {
        swarmId: flight.swarm_id,
        error: parseResult.error,
      });
    }
  }

  // ── Check if this is a verification flight completing ───────────
  if (flight.verify_meta) {
    return handleVerificationCompletion(flight, output, nectar);
  }

  // ── Handle loop flights with cells ──────────────────────────────
  if (flight.type === "loop" && flight.current_cell_id) {
    return handleLoopCellCompletion(flight, output, nectar);
  }

  // ── Single flight — mark done and advance ───────────────────────
  db.updateFlight(flightId, { status: "done", output });
  emitEvent({ eventType: "flight.completed", swarmId: flight.swarm_id, payload: { flight_id: flight.flight_id } });
  const advResult = advancePipeline(flight.swarm_id);
  if (advResult.action === "completed") {
    // Scheduler unregistration handled by caller / index.ts
  }

  logger.info("Flight completed", { flightId, flightName: flight.flight_id });
  return { success: true, message: `Flight "${flight.flight_id}" completed` };
}

// ── Loop Cell Completion ──────────────────────────────────────────

function handleLoopCellCompletion(
  flight: FlightRecord,
  output: string,
  nectar: Record<string, string>,
): CompleteFlightResult {
  const loopConfig: LoopConfig | null = flight.loop_config
    ? safeJsonParse<LoopConfig | null>(flight.loop_config, null)
    : null;

  const verifyEach = loopConfig?.verify_each ?? false;

  if (verifyEach) {
    // Mark cell as "verifying" (not "done" yet)
    db.updateCell(flight.current_cell_id!, { status: "verifying", output });
    emitEvent({
      eventType: "cell.verifying",
      swarmId: flight.swarm_id,
      payload: { cell_id: flight.current_cell_id },
    });

    // Create a dynamic inspector verification flight
    const verifyFlightId = loopConfig?.verify_flight;
    if (verifyFlightId) {
      createVerificationFlight(flight, verifyFlightId, nectar);
    } else {
      // No verify_flight template — fall back to marking cell done
      logger.warn("verify_each is true but no verify_flight template", {
        swarmId: flight.swarm_id,
        flightId: flight.flight_id,
      });
      db.updateCell(flight.current_cell_id!, { status: "done", output });
      return completeLoopCellNormally(flight, output);
    }

    // Set parent loop flight to waiting
    db.updateFlight(flight.id, { status: "waiting", output, current_cell_id: null });
    logger.info("Cell awaiting verification", {
      swarmId: flight.swarm_id,
      cellId: flight.current_cell_id,
    });
    return { success: true, message: `Flight "${flight.flight_id}" cell submitted for verification` };
  }

  // No verify_each — standard loop cell completion
  return completeLoopCellNormally(flight, output);
}

function completeLoopCellNormally(
  flight: FlightRecord,
  output: string,
): CompleteFlightResult {
  db.updateCell(flight.current_cell_id!, { status: "done", output });
  emitEvent({
    eventType: "cell.completed",
    swarmId: flight.swarm_id,
    payload: { cell_id: flight.current_cell_id },
  });

  // Check if more cells remain
  const nextCell = db.getNextPendingCell(flight.swarm_id);
  if (nextCell) {
    db.updateFlight(flight.id, { status: "pending", output, current_cell_id: null });
  } else {
    db.updateFlight(flight.id, { status: "done", output, current_cell_id: null });
    emitEvent({
      eventType: "flight.completed",
      swarmId: flight.swarm_id,
      payload: { flight_id: flight.flight_id },
    });
    advancePipeline(flight.swarm_id);
  }

  logger.info("Flight completed (loop cell)", { flightId: flight.id, flightName: flight.flight_id });
  return { success: true, message: `Flight "${flight.flight_id}" completed cell` };
}

// ── Create Verification Flight ────────────────────────────────────

function createVerificationFlight(
  parentFlight: FlightRecord,
  verifyFlightId: string,
  nectar: Record<string, string>,
): void {
  // Load blueprint spec to find the inspector flight template
  const swarm = db.getSwarm(parentFlight.swarm_id)!;
  const bp = db.getBlueprint(swarm.blueprint_id);
  if (!bp) return;

  const blueprintSpec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!blueprintSpec) return;
  const templateFlight = blueprintSpec.flights.find(f => f.id === verifyFlightId);
  if (!templateFlight) {
    logger.warn("Verify flight template not found in blueprint", {
      verifyFlightId,
      blueprintId: swarm.blueprint_id,
    });
    return;
  }

  const beeId = `${swarm.blueprint_id}_${templateFlight.bee}`;
  const flightIndex = parentFlight.flight_index + 0.5;
  const verifyMeta = JSON.stringify({
    parent_flight_id: parentFlight.id,
    cell_id: parentFlight.current_cell_id,
  });

  // Add cell context to nectar for the inspector template
  const cell = parentFlight.current_cell_id
    ? db.getCell(parentFlight.current_cell_id)
    : null;
  if (cell) {
    nectar.verify_cell_title = cell.title;
    nectar.verify_cell_description = cell.description;
    nectar.verify_cell_output = cell.output ?? "";
    nectar.verify_cell_criteria = cell.acceptance_criteria;
  }

  const dynamicFlightId = `${verifyFlightId}-${parentFlight.current_cell_id?.slice(0, 8) ?? "cell"}`;

  db.insertVerificationFlight(
    parentFlight.swarm_id,
    dynamicFlightId,
    beeId,
    flightIndex,
    templateFlight.input,
    templateFlight.expects,
    templateFlight.max_retries ?? 1,
    verifyMeta,
  );

  emitEvent({
    eventType: "flight.inspector_created",
    swarmId: parentFlight.swarm_id,
    payload: {
      parent_flight_id: parentFlight.id,
      cell_id: parentFlight.current_cell_id,
      verify_flight_id: dynamicFlightId,
    },
  });
}

// ── Verification Flight Completion ────────────────────────────────

function handleVerificationCompletion(
  flight: FlightRecord,
  output: string,
  nectar: Record<string, string>,
): CompleteFlightResult {
  const meta = safeJsonParse<{ parent_flight_id: string; cell_id: string } | null>(
    flight.verify_meta ?? "",
    null,
  );
  if (!meta) {
    db.updateFlight(flight.id, { status: "done", output });
    return { success: true, message: "Verification flight completed (corrupt metadata)" };
  }

  // Parse STATUS from inspector output
  const statusMatch = output.match(/^STATUS:\s*(\w+)/m);
  const status = statusMatch?.[1]?.toLowerCase() ?? "pass";

  // Mark verification flight as done
  db.updateFlight(flight.id, { status: "done", output });

  const parentFlight = db.getFlight(meta.parent_flight_id);
  if (!parentFlight) {
    logger.error("Parent flight not found for verification", {
      parentFlightId: meta.parent_flight_id,
    });
    return { success: true, message: `Verification flight completed (orphaned)` };
  }

  if (status === "retry" || status === "fail") {
    // Extract feedback from inspector output
    const feedbackMatch = output.match(/^FEEDBACK:\s*(.+)/m);
    const feedback = feedbackMatch?.[1]?.trim() ?? "Inspector requested retry";

    // Cell → pending (for re-implementation)
    db.updateCell(meta.cell_id, { status: "pending" });

    // Store feedback in nectar for the worker's next attempt
    nectar.inspect_feedback = feedback;
    db.updateSwarm(flight.swarm_id, { nectar: JSON.stringify(nectar) });

    // Re-activate parent loop flight → pending
    db.updateFlight(meta.parent_flight_id, { status: "pending" });

    logger.info("Verification: retry requested", {
      cellId: meta.cell_id,
      feedback,
    });
    return { success: true, message: `Verification: retry requested for cell` };
  }

  // STATUS: pass — cell is verified done
  db.updateCell(meta.cell_id, { status: "done" });
  emitEvent({
    eventType: "cell.completed",
    swarmId: flight.swarm_id,
    payload: { cell_id: meta.cell_id, verified: true },
  });

  // Check if more pending cells remain
  const nextCell = db.getNextPendingCell(flight.swarm_id);
  if (nextCell) {
    // More cells to process — re-activate parent loop flight
    db.updateFlight(meta.parent_flight_id, { status: "pending" });
  } else {
    // All cells verified — complete parent loop flight
    db.updateFlight(meta.parent_flight_id, { status: "done", current_cell_id: null });
    emitEvent({
      eventType: "flight.completed",
      swarmId: flight.swarm_id,
      payload: { flight_id: parentFlight.flight_id },
    });
    advancePipeline(flight.swarm_id);
  }

  logger.info("Verification: passed", { cellId: meta.cell_id });
  return { success: true, message: `Verification passed for cell` };
}
