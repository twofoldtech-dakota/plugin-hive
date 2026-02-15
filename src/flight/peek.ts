import * as db from "../db.js";

export interface PeekResult {
  beeId: string;
  hasWork: boolean;
  pendingCount: number;
}

export function peekFlight(beeId: string): PeekResult {
  const count = db.peekFlightsForBee(beeId);
  return { beeId, hasWork: count > 0, pendingCount: count };
}
