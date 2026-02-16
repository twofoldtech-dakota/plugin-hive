import { statSync } from "node:fs";
import * as db from "../db.js";
import { dbPath } from "../lib/paths.js";
import { getConfigNumber, getConfigBoolean } from "../config/global.js";

export interface StorageStatus {
  db_file_size_bytes: number;
  db_file_size_mb: string;
  table_counts: Record<string, number>;
  oldest_entries: Record<string, string | null>;
  retention: {
    retention_days: number;
    auto_archive: boolean;
    archivable_swarms: number;
  };
  archives: {
    total: number;
  };
}

/**
 * Get storage status: DB file size, table counts, oldest entries, retention settings.
 */
export function getStorageStatus(): StorageStatus {
  const path = dbPath();
  let fileSizeBytes = 0;
  try {
    fileSizeBytes = statSync(path).size;
  } catch {
    // DB file may not exist yet
  }

  const tableCounts = db.getTableCounts();
  const retentionDays = getConfigNumber("retention_days", 30);
  const autoArchive = getConfigBoolean("auto_archive", false);

  const oldCompleted = db.getOldCompletedSwarms(retentionDays);
  const archives = db.listSwarmArchives(1000);

  const oldestEntries: Record<string, string | null> = {
    swarms: db.getOldestEntry("swarms", "created_at"),
    flights: db.getOldestEntry("flights", "created_at"),
    events: db.getOldestEntry("events", "created_at"),
  };

  return {
    db_file_size_bytes: fileSizeBytes,
    db_file_size_mb: (fileSizeBytes / (1024 * 1024)).toFixed(2),
    table_counts: tableCounts,
    oldest_entries: oldestEntries,
    retention: {
      retention_days: retentionDays,
      auto_archive: autoArchive,
      archivable_swarms: oldCompleted.length,
    },
    archives: {
      total: archives.length,
    },
  };
}
