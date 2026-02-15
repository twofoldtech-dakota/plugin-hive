import * as db from "../db.js";
import type { ParsedCell } from "./parse.js";
import type { CellRecord } from "../types.js";

// ── Bulk Insert ─────────────────────────────────────────────────────

/**
 * Insert parsed cells into the database for a swarm.
 * Returns the inserted cell records.
 */
export function insertCellsFromParsed(
  swarmId: string,
  cells: ParsedCell[],
  maxRetries: number = 3,
): CellRecord[] {
  const records: CellRecord[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const record = db.insertCell(
      swarmId,
      i,
      cell.id,
      cell.title,
      cell.description,
      cell.acceptance_criteria,
      maxRetries,
    );
    records.push(record);
  }
  return records;
}

// ── Progress Aggregation ────────────────────────────────────────────

export interface CellProgress {
  total: number;
  pending: number;
  in_progress: number;
  verifying: number;
  done: number;
  failed: number;
}

/**
 * Get aggregate cell status counts for a swarm.
 */
export function getCellProgress(swarmId: string): CellProgress {
  const cells = db.getCellsForSwarm(swarmId);
  const progress: CellProgress = {
    total: cells.length,
    pending: 0,
    in_progress: 0,
    verifying: 0,
    done: 0,
    failed: 0,
  };

  for (const cell of cells) {
    switch (cell.status) {
      case "pending":
        progress.pending++;
        break;
      case "in_progress":
        progress.in_progress++;
        break;
      case "verifying":
        progress.verifying++;
        break;
      case "done":
        progress.done++;
        break;
      case "failed":
        progress.failed++;
        break;
    }
  }

  return progress;
}
