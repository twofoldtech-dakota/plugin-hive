import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";

export type ArchiveResult =
  | { success: true; archive_id: string; message: string }
  | { success: false; error: string };

/**
 * Archive a completed/failed/cancelled swarm to compressed storage.
 * Collects full state, inserts into swarm_archives, deletes originals.
 */
export function archiveSwarm(swarmId: string): ArchiveResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  const terminalStatuses = ["completed", "failed", "cancelled"];
  if (!terminalStatuses.includes(swarm.status)) {
    return { success: false, error: `Cannot archive swarm with status "${swarm.status}". Must be completed, failed, or cancelled.` };
  }

  // Collect full state
  const flights = db.getFlightsForSwarm(swarmId);
  const cells = db.getCellsForSwarm(swarmId);
  const events = db.getEventsForSwarm(swarmId, 1000);
  const traces = db.getTracesForSwarm(swarmId);
  const usage = db.getUsageForSwarm(swarmId);
  const snapshots = db.getSnapshotsForSwarm(swarmId);
  const nectar = safeJsonParse<Record<string, string>>(swarm.nectar, {});

  const archiveData = JSON.stringify({
    swarm,
    flights,
    cells,
    events,
    traces,
    usage,
    snapshots,
    nectar,
    archived_at: new Date().toISOString(),
  });

  // Insert archive
  const archive = db.insertSwarmArchive(
    swarm.swarm_number,
    swarm.blueprint_id,
    swarm.task,
    swarm.status,
    archiveData,
  );

  // Delete original data
  db.deleteSwarmData(swarmId);

  emitEvent({
    eventType: "swarm.archived",
    payload: { swarm_id: swarmId, archive_id: archive.id, swarm_number: swarm.swarm_number },
  });

  logger.info("Swarm archived", { swarmId, archiveId: archive.id, swarmNumber: swarm.swarm_number });

  return {
    success: true,
    archive_id: archive.id,
    message: `Swarm #${swarm.swarm_number} archived (${flights.length} flights, ${cells.length} cells, ${events.length} events)`,
  };
}
