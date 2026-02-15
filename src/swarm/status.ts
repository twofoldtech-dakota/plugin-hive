import * as db from "../db.js";

export type GetSwarmStatusResult =
  | {
      success: true;
      data: {
        swarm: {
          id: string;
          number: number;
          blueprint: string;
          task: string;
          status: string;
          created_at: string;
        };
        flights: Array<{
          id: string;
          bee: string;
          status: string;
          type: string;
          retries: number;
        }>;
        cells?: Array<{
          id: string;
          title: string;
          status: string;
        }>;
      };
    }
  | { success: false; error: string };

export function getSwarmStatus(query: string): GetSwarmStatusResult {
  const swarm = db.findSwarm(query);
  if (!swarm) {
    return { success: false, error: `No swarm found matching "${query}"` };
  }

  const flights = db.getFlightsForSwarm(swarm.id);
  const cells = db.getCellsForSwarm(swarm.id);

  return {
    success: true,
    data: {
      swarm: {
        id: swarm.id,
        number: swarm.swarm_number,
        blueprint: swarm.blueprint_id,
        task: swarm.task,
        status: swarm.status,
        created_at: swarm.created_at,
      },
      flights: flights.map(f => ({
        id: f.flight_id,
        bee: f.bee_id,
        status: f.status,
        type: f.type,
        retries: f.retry_count,
        started_at: f.started_at,
        completed_at: f.completed_at,
      })),
      cells: cells.length > 0
        ? cells.map(c => ({ id: c.cell_id, title: c.title, status: c.status, started_at: c.started_at, completed_at: c.completed_at }))
        : undefined,
    },
  };
}
