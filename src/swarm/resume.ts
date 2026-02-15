import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";

export type ResumeSwarmResult =
  | { success: true; message: string; resetFlights: number; resetCells: number }
  | { success: false; error: string };

export function resumeSwarm(swarmId: string): ResumeSwarmResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }
  if (swarm.status !== "failed") {
    return { success: false, error: `Swarm is ${swarm.status}, only failed swarms can be resumed` };
  }

  // Reset swarm status to buzzing
  db.updateSwarm(swarmId, { status: "buzzing" });

  // Reset all failed flights → pending, zero retry_count and abandoned_count
  const flights = db.getFlightsForSwarm(swarmId);
  let resetFlights = 0;
  for (const flight of flights) {
    if (flight.status === "failed") {
      db.updateFlight(flight.id, {
        status: "pending",
        retry_count: 0,
        abandoned_count: 0,
        current_cell_id: null,
      });
      resetFlights++;
    }
  }

  // Reset all failed cells → pending, zero retry_count
  const cells = db.getCellsForSwarm(swarmId);
  let resetCells = 0;
  for (const cell of cells) {
    if (cell.status === "failed") {
      db.updateCell(cell.id, { status: "pending", retry_count: 0 });
      resetCells++;
    }
  }

  emitEvent({
    eventType: "swarm.resumed",
    swarmId,
    payload: { reset_flights: resetFlights, reset_cells: resetCells },
  });
  logger.info("Swarm resumed", { swarmId, resetFlights, resetCells });

  return {
    success: true,
    message: `Swarm #${swarm.swarm_number} resumed (${resetFlights} flights, ${resetCells} cells reset)`,
    resetFlights,
    resetCells,
  };
}
