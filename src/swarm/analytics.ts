import * as db from "../db.js";

export interface SwarmAnalytics {
  swarm_id: string;
  status: string;
  flights: {
    total: number;
    durations: Array<{ flight_id: string; status: string; duration_seconds: number | null }>;
    bottleneck: { flight_id: string; duration_seconds: number } | null;
    total_duration_seconds: number;
  };
  cells: {
    total: number;
    durations: Array<{ cell_id: string; status: string; duration_seconds: number | null }>;
    average_duration_seconds: number | null;
  };
  bee_utilization: Record<string, { flights_completed: number; total_seconds: number }>;
  parallelism_ratio: number;
}

export type GetSwarmAnalyticsResult =
  | { success: true; data: SwarmAnalytics }
  | { success: false; error: string };

/**
 * Get performance analytics for a completed or in-progress swarm.
 */
export function getSwarmAnalytics(swarmId: string): GetSwarmAnalyticsResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  const flightDurations = db.getFlightDurations(swarmId);
  const cellDurations = db.getCellDurations(swarmId);

  // Find bottleneck (longest flight)
  let bottleneck: { flight_id: string; duration_seconds: number } | null = null;
  let totalFlightDuration = 0;
  for (const fd of flightDurations) {
    if (fd.duration_seconds !== null) {
      totalFlightDuration += fd.duration_seconds;
      if (!bottleneck || fd.duration_seconds > bottleneck.duration_seconds) {
        bottleneck = { flight_id: fd.flight_id, duration_seconds: fd.duration_seconds };
      }
    }
  }

  // Cell average duration
  const cellsWithDuration = cellDurations.filter(c => c.duration_seconds !== null);
  const avgCellDuration = cellsWithDuration.length > 0
    ? cellsWithDuration.reduce((sum, c) => sum + c.duration_seconds!, 0) / cellsWithDuration.length
    : null;

  // Bee utilization
  const flights = db.getFlightsForSwarm(swarmId).filter(f => !f.verify_meta);
  const beeUtilization: Record<string, { flights_completed: number; total_seconds: number }> = {};
  for (const f of flights) {
    if (f.status === "done") {
      const dur = flightDurations.find(fd => fd.flight_id === f.flight_id);
      if (!beeUtilization[f.bee_id]) {
        beeUtilization[f.bee_id] = { flights_completed: 0, total_seconds: 0 };
      }
      beeUtilization[f.bee_id].flights_completed++;
      if (dur?.duration_seconds) {
        beeUtilization[f.bee_id].total_seconds += dur.duration_seconds;
      }
    }
  }

  // Parallelism ratio: total flight time / wall clock time
  // Wall clock = time from first started_at to last completed_at
  const startedFlights = flights.filter(f => f.started_at).map(f => new Date(f.started_at!.replace(" ", "T") + "Z").getTime());
  const completedFlights = flights.filter(f => f.completed_at).map(f => new Date(f.completed_at!.replace(" ", "T") + "Z").getTime());
  let parallelismRatio = 1;
  if (startedFlights.length > 0 && completedFlights.length > 0) {
    const wallClock = (Math.max(...completedFlights) - Math.min(...startedFlights)) / 1000;
    if (wallClock > 0 && totalFlightDuration > 0) {
      parallelismRatio = Math.round((totalFlightDuration / wallClock) * 100) / 100;
    }
  }

  return {
    success: true,
    data: {
      swarm_id: swarmId,
      status: swarm.status,
      flights: {
        total: flightDurations.length,
        durations: flightDurations,
        bottleneck,
        total_duration_seconds: totalFlightDuration,
      },
      cells: {
        total: cellDurations.length,
        durations: cellDurations,
        average_duration_seconds: avgCellDuration !== null ? Math.round(avgCellDuration) : null,
      },
      bee_utilization: beeUtilization,
      parallelism_ratio: parallelismRatio,
    },
  };
}
