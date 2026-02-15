import * as db from "../db.js";
import { resolveNectar } from "./template.js";
import { emitEvent } from "../lib/events.js";
import type { FlightClaimResult } from "../types.js";

export type ClaimFlightResult =
  | { success: true; claimed: true; data: FlightClaimResult }
  | { success: true; claimed: false };

export function claimFlight(beeId: string): ClaimFlightResult {
  const flight = db.claimFlightForBee(beeId);
  if (!flight) {
    return { success: true, claimed: false };
  }

  // Resolve nectar template
  const swarm = db.getSwarm(flight.swarm_id)!;
  const nectar = JSON.parse(swarm.nectar) as Record<string, string>;
  nectar.swarm_id = swarm.id;

  // For loop flights, include cell context
  let cell: FlightClaimResult["cell"];
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
  const resolvedInput = resolveNectar(flight.input_template, nectar);

  emitEvent({ eventType: "flight.claimed", swarmId: swarm.id, payload: { flight_id: flight.flight_id, bee_id: beeId } });

  return {
    success: true,
    claimed: true,
    data: {
      flight_id: flight.id,
      swarm_id: flight.swarm_id,
      resolved_input: resolvedInput,
      expects: flight.expects,
      type: flight.type,
      cell,
    },
  };
}
