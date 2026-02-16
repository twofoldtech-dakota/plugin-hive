import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { emitEvent } from "../lib/events.js";
import type { BlueprintSpec, DependencyGraph, DependencyGraphNode, DependencyGraphEdge } from "../types.js";

/**
 * Compute the dependency graph for installed blueprints.
 * Uses Kahn's algorithm for cycle detection.
 */
export function computeDependencyGraph(blueprintId?: string): DependencyGraph {
  const installed = db.listBlueprints();
  const specs = new Map<string, BlueprintSpec>();

  for (const bp of installed) {
    const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
    if (spec) specs.set(bp.id, spec);
  }

  // If a specific blueprint is requested, focus on its dependency tree
  const targetIds = blueprintId ? collectDependencyTree(blueprintId, specs) : [...specs.keys()];

  const nodes: DependencyGraphNode[] = [];
  const edges: DependencyGraphEdge[] = [];
  const missing: string[] = [];

  for (const id of targetIds) {
    const spec = specs.get(id);
    const bpRecord = installed.find(b => b.id === id);
    const requires = spec
      ? getRequires(spec)
      : bpRecord?.requires
        ? safeJsonParse<string[]>(bpRecord.requires, [])
        : [];

    nodes.push({
      id,
      name: spec?.name ?? null,
      installed: specs.has(id),
      requires,
    });

    for (const req of requires) {
      edges.push({ from: req, to: id }); // req must be present before id
      if (!specs.has(req) && !targetIds.includes(req)) {
        targetIds.push(req);
        missing.push(req);
        nodes.push({ id: req, name: null, installed: false, requires: [] });
      } else if (!specs.has(req) && !missing.includes(req)) {
        missing.push(req);
      }
    }
  }

  // Kahn's algorithm for cycle detection
  const cycles = detectCycles(nodes, edges);

  const valid = missing.length === 0 && cycles.length === 0;

  if (blueprintId) {
    emitEvent({ eventType: "blueprint.deps_validated", payload: { blueprint_id: blueprintId, valid, missing, cycles: cycles.length } });
  }

  return { nodes, edges, missing, cycles, valid };
}

/**
 * Validate that all requirements for a blueprint are met.
 */
export function validateRequirements(blueprintId: string): { valid: boolean; missing: string[]; message: string } {
  const graph = computeDependencyGraph(blueprintId);

  if (graph.valid) {
    return { valid: true, missing: [], message: `All requirements satisfied for "${blueprintId}"` };
  }

  const issues: string[] = [];
  if (graph.missing.length > 0) {
    issues.push(`Missing required blueprints: ${graph.missing.join(", ")}`);
  }
  if (graph.cycles.length > 0) {
    issues.push(`Dependency cycles detected: ${graph.cycles.map(c => c.join(" → ")).join("; ")}`);
  }

  return { valid: false, missing: graph.missing, message: issues.join(". ") };
}

// ── Helpers ────────────────────────────────────────────────────────

function getRequires(spec: BlueprintSpec): string[] {
  // Check for 'requires' field on the spec (added in Phase 19)
  return (spec as BlueprintSpec & { requires?: string[] }).requires ?? [];
}

function collectDependencyTree(rootId: string, specs: Map<string, BlueprintSpec>): string[] {
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const spec = specs.get(id);
    if (spec) {
      const requires = getRequires(spec);
      for (const req of requires) {
        if (!visited.has(req)) queue.push(req);
      }
    }
  }

  return [...visited];
}

function detectCycles(nodes: DependencyGraphNode[], edges: DependencyGraphEdge[]): string[][] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    if (adj.has(edge.from)) {
      adj.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (visited >= nodes.length) return [];

  // Find nodes in cycles (in-degree > 0 after Kahn's)
  const cycleNodes = [...inDegree.entries()]
    .filter(([_, deg]) => deg > 0)
    .map(([id]) => id);

  return cycleNodes.length > 0 ? [cycleNodes] : [];
}
