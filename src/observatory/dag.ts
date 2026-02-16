import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import type { DAGNode, DAGEdge, DAGView, FlightRecord } from "../types.js";

/**
 * Compute a DAG view for a swarm's flight pipeline.
 * Returns nodes (flights), edges (dependencies), critical path, and parallelism ratio.
 */
export function computeDAG(swarmId: string): { success: true; dag: DAGView } | { success: false; error: string } {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) return { success: false, error: `Swarm not found: ${swarmId}` };

  const flights = db.getFlightsForSwarm(swarmId).filter(f => !f.verify_meta);
  if (flights.length === 0) return { success: false, error: "No flights in swarm" };

  const flightMap = new Map<string, FlightRecord>();
  for (const f of flights) flightMap.set(f.flight_id, f);

  // Build edges from depends_on
  const edges: DAGEdge[] = [];
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const f of flights) {
    inDegree.set(f.flight_id, 0);
    adj.set(f.flight_id, []);
  }

  const isDAG = flights.some(f => f.depends_on !== null);

  if (isDAG) {
    for (const f of flights) {
      const deps = safeJsonParse<string[]>(f.depends_on ?? "", []);
      for (const dep of deps) {
        edges.push({ from: dep, to: f.flight_id });
        adj.get(dep)?.push(f.flight_id);
        inDegree.set(f.flight_id, (inDegree.get(f.flight_id) ?? 0) + 1);
      }
    }
  } else {
    // Sequential: implicit chain
    for (let i = 1; i < flights.length; i++) {
      edges.push({ from: flights[i - 1].flight_id, to: flights[i].flight_id });
      adj.get(flights[i - 1].flight_id)?.push(flights[i].flight_id);
      inDegree.set(flights[i].flight_id, 1);
    }
  }

  // Topological sort to assign layers (BFS)
  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  let maxLayer = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    const layer = layers.get(node)!;
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      const neighborLayer = Math.max(layers.get(neighbor) ?? 0, layer + 1);
      layers.set(neighbor, neighborLayer);
      maxLayer = Math.max(maxLayer, neighborLayer);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // Build nodes
  const nodes: DAGNode[] = flights.map(f => {
    const dur = db.getFlightElapsed(f.id);
    return {
      id: f.flight_id,
      bee_id: f.bee_id,
      type: f.sub_swarm_config ? "sub_swarm" : f.type as "single" | "loop",
      status: f.status,
      duration_seconds: dur,
      layer: layers.get(f.flight_id) ?? 0,
    };
  });

  // Compute critical path (longest path through the DAG by duration)
  const criticalPath = computeCriticalPath(flights, edges, flightMap);

  // Parallelism ratio: max flights per layer / total layers
  const layerCounts = new Map<number, number>();
  for (const node of nodes) {
    layerCounts.set(node.layer, (layerCounts.get(node.layer) ?? 0) + 1);
  }
  const maxParallel = Math.max(...layerCounts.values(), 1);
  const totalLayers = maxLayer + 1;
  const parallelismRatio = totalLayers > 0 ? Math.round((maxParallel / totalLayers) * 100) / 100 : 1;

  return {
    success: true,
    dag: {
      nodes,
      edges,
      critical_path: criticalPath,
      parallelism_ratio: parallelismRatio,
      total_layers: totalLayers,
    },
  };
}

function computeCriticalPath(
  flights: FlightRecord[],
  edges: DAGEdge[],
  flightMap: Map<string, FlightRecord>,
): string[] {
  // Use longest-path through DAG weighted by duration
  const durationMap = new Map<string, number>();
  for (const f of flights) {
    const dur = db.getFlightElapsed(f.id) ?? 0;
    durationMap.set(f.flight_id, dur);
  }

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const f of flights) {
    adj.set(f.flight_id, []);
    inDegree.set(f.flight_id, 0);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  // Topological order
  const order: string[] = [];
  const q: string[] = [];
  const deg = new Map(inDegree);
  for (const [id, d] of deg) {
    if (d === 0) q.push(id);
  }
  while (q.length > 0) {
    const n = q.shift()!;
    order.push(n);
    for (const neighbor of adj.get(n) ?? []) {
      deg.set(neighbor, (deg.get(neighbor) ?? 1) - 1);
      if (deg.get(neighbor) === 0) q.push(neighbor);
    }
  }

  // Longest path from each node
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  for (const id of order) {
    dist.set(id, durationMap.get(id) ?? 0);
    prev.set(id, null);
  }

  for (const node of order) {
    for (const neighbor of adj.get(node) ?? []) {
      const newDist = (dist.get(node) ?? 0) + (durationMap.get(neighbor) ?? 0);
      if (newDist > (dist.get(neighbor) ?? 0)) {
        dist.set(neighbor, newDist);
        prev.set(neighbor, node);
      }
    }
  }

  // Find end node with max distance
  let maxDist = 0;
  let endNode = order[0];
  for (const [id, d] of dist) {
    if (d >= maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  // Trace back
  const path: string[] = [];
  let current: string | null = endNode;
  while (current) {
    path.unshift(current);
    current = prev.get(current) ?? null;
  }
  return path;
}
