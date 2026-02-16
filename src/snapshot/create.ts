import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import type { SnapshotRecord } from "../types.js";

export type CreateSnapshotResult =
  | { success: true; snapshot: SnapshotRecord }
  | { success: false; error: string };

/**
 * Export full swarm state as a JSON snapshot.
 */
export function createSnapshot(
  swarmId: string,
  snapshotType: "manual" | "checkpoint" | "auto" = "manual",
): CreateSnapshotResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  const flights = db.getFlightsForSwarm(swarmId);
  const cells = db.getCellsForSwarm(swarmId);
  const nectar = safeJsonParse(swarm.nectar, {});

  const data = {
    swarm: {
      id: swarm.id,
      swarm_number: swarm.swarm_number,
      blueprint_id: swarm.blueprint_id,
      task: swarm.task,
      status: swarm.status,
      nectar,
      notify_url: swarm.notify_url,
      chain_id: swarm.chain_id,
      parent_swarm_id: swarm.parent_swarm_id,
      created_at: swarm.created_at,
      updated_at: swarm.updated_at,
    },
    flights: flights.map(f => ({
      id: f.id,
      flight_id: f.flight_id,
      bee_id: f.bee_id,
      flight_index: f.flight_index,
      status: f.status,
      output: f.output,
      retry_count: f.retry_count,
      max_retries: f.max_retries,
      type: f.type,
      current_cell_id: f.current_cell_id,
      started_at: f.started_at,
      completed_at: f.completed_at,
    })),
    cells: cells.map(c => ({
      id: c.id,
      cell_index: c.cell_index,
      cell_id: c.cell_id,
      title: c.title,
      description: c.description,
      status: c.status,
      output: c.output,
      retry_count: c.retry_count,
      started_at: c.started_at,
      completed_at: c.completed_at,
    })),
    snapshot_at: new Date().toISOString(),
  };

  const snapshot = db.insertSnapshot(swarmId, JSON.stringify(data), snapshotType);
  return { success: true, snapshot };
}
