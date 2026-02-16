import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { logger } from "../lib/logger.js";

export type RestoreSnapshotResult =
  | { success: true; message: string; flights_reset: number; cells_reset: number }
  | { success: false; error: string };

interface SnapshotData {
  swarm: {
    status: string;
    nectar: Record<string, string>;
  };
  flights: Array<{
    id: string;
    status: string;
    output: string | null;
    retry_count: number;
    current_cell_id: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>;
  cells: Array<{
    id: string;
    status: string;
    output: string | null;
    retry_count: number;
    started_at: string | null;
    completed_at: string | null;
  }>;
}

/**
 * Restore swarm to a snapshot state — reset flights, cells, nectar.
 */
export function restoreSnapshot(snapshotId: string): RestoreSnapshotResult {
  const snapshot = db.getSnapshot(snapshotId);
  if (!snapshot) {
    return { success: false, error: `Snapshot "${snapshotId}" not found` };
  }

  const data = safeJsonParse<SnapshotData | null>(snapshot.data, null);
  if (!data) {
    return { success: false, error: "Snapshot data is corrupt" };
  }

  const swarm = db.getSwarm(snapshot.swarm_id);
  if (!swarm) {
    return { success: false, error: `Swarm "${snapshot.swarm_id}" not found` };
  }

  // Restore swarm nectar and status
  db.updateSwarm(snapshot.swarm_id, {
    status: data.swarm.status as "buzzing",
    nectar: JSON.stringify(data.swarm.nectar),
  });

  // Restore flights
  let flightsReset = 0;
  for (const flightSnap of data.flights) {
    const flight = db.getFlight(flightSnap.id);
    if (flight) {
      db.updateFlight(flightSnap.id, {
        status: flightSnap.status as "waiting",
        output: flightSnap.output,
        retry_count: flightSnap.retry_count,
        current_cell_id: flightSnap.current_cell_id,
        started_at: flightSnap.started_at,
        completed_at: flightSnap.completed_at,
      });
      flightsReset++;
    }
  }

  // Restore cells
  let cellsReset = 0;
  for (const cellSnap of data.cells) {
    const cell = db.getCell(cellSnap.id);
    if (cell) {
      db.updateCell(cellSnap.id, {
        status: cellSnap.status as "pending",
        output: cellSnap.output,
        retry_count: cellSnap.retry_count,
        started_at: cellSnap.started_at,
        completed_at: cellSnap.completed_at,
      });
      cellsReset++;
    }
  }

  db.bumpEpoch();
  logger.info("Snapshot restored", { snapshotId, swarmId: snapshot.swarm_id, flightsReset, cellsReset });

  return {
    success: true,
    message: `Restored swarm to snapshot ${snapshotId}`,
    flights_reset: flightsReset,
    cells_reset: cellsReset,
  };
}
