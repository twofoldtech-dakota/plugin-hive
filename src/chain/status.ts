import * as db from "../db.js";
import type { ChainRecord } from "../types.js";

export interface ChainStatus {
  chain: ChainRecord;
  swarms: Array<{
    id: string;
    swarm_number: number;
    blueprint_id: string;
    task: string;
    status: string;
    parent_swarm_id: string | null;
    created_at: string;
  }>;
}

export type ChainStatusResult =
  | { success: true; data: ChainStatus }
  | { success: false; error: string };

export type ChainListResult =
  | { success: true; chains: ChainRecord[] }
  | { success: false; error: string };

/**
 * Get the status of a chain with all its swarms.
 */
export function getChainStatus(chainId: string): ChainStatusResult {
  const chain = db.getChain(chainId);
  if (!chain) {
    return { success: false, error: `Chain "${chainId}" not found` };
  }

  const swarms = db.getSwarmsForChain(chainId);

  return {
    success: true,
    data: {
      chain,
      swarms: swarms.map(s => ({
        id: s.id,
        swarm_number: s.swarm_number,
        blueprint_id: s.blueprint_id,
        task: s.task,
        status: s.status,
        parent_swarm_id: s.parent_swarm_id,
        created_at: s.created_at,
      })),
    },
  };
}

/**
 * List all chains with optional status filter.
 */
export function listChains(status?: string): ChainListResult {
  const chains = db.listChains(status ? { status } : undefined);
  return { success: true, chains };
}
