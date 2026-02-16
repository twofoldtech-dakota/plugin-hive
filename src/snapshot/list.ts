import * as db from "../db.js";
import type { SnapshotRecord } from "../types.js";

export type ListSnapshotsResult =
  | { success: true; snapshots: SnapshotRecord[] }
  | { success: false; error: string };

/**
 * List snapshots for a swarm.
 */
export function listSnapshots(swarmId: string): ListSnapshotsResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }
  const snapshots = db.getSnapshotsForSwarm(swarmId);
  return { success: true, snapshots };
}
