import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import type { SwarmComparison, FlightComparison, ComparisonSummary, FlightRecord, SwarmRecord, SwarmArchiveRecord } from "../types.js";

export type CompareResult =
  | { success: true; comparison: SwarmComparison }
  | { success: false; error: string };

interface ResolvedSwarm {
  id: string;
  task: string;
  status: string;
  blueprint_id: string;
  nectar: Record<string, string>;
  flights: Array<{ flight_id: string; status: string; duration_seconds: number | null; bee_id: string }>;
  tokens: number;
}

function resolveSwarm(idOrNumber: string): ResolvedSwarm | null {
  const result = db.getSwarmOrArchive(idOrNumber);
  if (!result) return null;

  if (result.source === "swarm") {
    const swarm = result.data as SwarmRecord;
    const flights = db.getFlightsForSwarm(swarm.id).filter(f => !f.verify_meta);
    const durations = db.getFlightDurations(swarm.id);
    const durationMap = new Map(durations.map(d => [d.flight_id, d.duration_seconds]));
    const usage = db.getUsageForSwarm(swarm.id);
    const tokens = usage.reduce((sum, u) => sum + u.input_tokens + u.output_tokens, 0);

    return {
      id: swarm.id,
      task: swarm.task,
      status: swarm.status,
      blueprint_id: swarm.blueprint_id,
      nectar: safeJsonParse(swarm.nectar, {}),
      flights: flights.map(f => ({
        flight_id: f.flight_id,
        status: f.status,
        duration_seconds: durationMap.get(f.flight_id) ?? null,
        bee_id: f.bee_id,
      })),
      tokens,
    };
  }

  // Archive
  const archive = result.data as SwarmArchiveRecord;
  const data = safeJsonParse<{
    swarm: SwarmRecord;
    flights: FlightRecord[];
    nectar: Record<string, string>;
    usage?: Array<{ input_tokens: number; output_tokens: number }>;
  }>(archive.data, { swarm: {} as SwarmRecord, flights: [], nectar: {} });

  const tokens = data.usage?.reduce((sum, u) => sum + u.input_tokens + u.output_tokens, 0) ?? 0;

  return {
    id: archive.id,
    task: archive.task,
    status: archive.original_status,
    blueprint_id: archive.blueprint_id,
    nectar: data.nectar ?? {},
    flights: (data.flights ?? []).filter(f => !f.verify_meta).map(f => ({
      flight_id: f.flight_id,
      status: f.status,
      duration_seconds: f.started_at && f.completed_at
        ? Math.round((new Date(f.completed_at).getTime() - new Date(f.started_at).getTime()) / 1000)
        : null,
      bee_id: f.bee_id,
    })),
    tokens,
  };
}

/**
 * Compare two swarm runs side-by-side.
 */
export function compareSwarms(swarmA: string, swarmB: string): CompareResult {
  const a = resolveSwarm(swarmA);
  if (!a) return { success: false, error: `Swarm A "${swarmA}" not found` };

  const b = resolveSwarm(swarmB);
  if (!b) return { success: false, error: `Swarm B "${swarmB}" not found` };

  // Build flight comparison
  const allFlightIds = new Set([
    ...a.flights.map(f => f.flight_id),
    ...b.flights.map(f => f.flight_id),
  ]);
  const aMap = new Map(a.flights.map(f => [f.flight_id, f]));
  const bMap = new Map(b.flights.map(f => [f.flight_id, f]));

  const flights: FlightComparison[] = [];
  let matchCount = 0;
  let differCount = 0;
  let aDurationTotal = 0;
  let bDurationTotal = 0;

  for (const fid of allFlightIds) {
    const af = aMap.get(fid);
    const bf = bMap.get(fid);
    const statusMatch = (af?.status ?? "missing") === (bf?.status ?? "missing");
    if (statusMatch) matchCount++;
    else differCount++;

    if (af?.duration_seconds) aDurationTotal += af.duration_seconds;
    if (bf?.duration_seconds) bDurationTotal += bf.duration_seconds;

    flights.push({
      flight_id: fid,
      a_status: af?.status ?? "missing",
      b_status: bf?.status ?? "missing",
      a_duration_seconds: af?.duration_seconds ?? null,
      b_duration_seconds: bf?.duration_seconds ?? null,
      status_match: statusMatch,
    });
  }

  // Nectar diff
  const allNectarKeys = new Set([...Object.keys(a.nectar), ...Object.keys(b.nectar)]);
  const diffKeys: string[] = [];
  for (const key of allNectarKeys) {
    if (a.nectar[key] !== b.nectar[key]) {
      diffKeys.push(key);
    }
  }

  const summary: ComparisonSummary = {
    flights_match: matchCount,
    flights_differ: differCount,
    a_total_duration: aDurationTotal,
    b_total_duration: bDurationTotal,
    a_total_tokens: a.tokens,
    b_total_tokens: b.tokens,
    nectar_diff_keys: diffKeys,
  };

  const markdown = formatMarkdown(a, b, flights, summary);

  return {
    success: true,
    comparison: {
      swarm_a: { id: a.id, task: a.task, status: a.status, blueprint_id: a.blueprint_id },
      swarm_b: { id: b.id, task: b.task, status: b.status, blueprint_id: b.blueprint_id },
      flights,
      summary,
      markdown,
    },
  };
}

function formatMarkdown(
  a: ResolvedSwarm,
  b: ResolvedSwarm,
  flights: FlightComparison[],
  summary: ComparisonSummary,
): string {
  const lines: string[] = [
    `# Swarm Comparison`,
    ``,
    `| | Swarm A | Swarm B |`,
    `|---|---|---|`,
    `| ID | ${a.id.slice(0, 8)} | ${b.id.slice(0, 8)} |`,
    `| Blueprint | ${a.blueprint_id} | ${b.blueprint_id} |`,
    `| Status | ${a.status} | ${b.status} |`,
    `| Task | ${a.task.slice(0, 40)} | ${b.task.slice(0, 40)} |`,
    `| Duration (s) | ${summary.a_total_duration} | ${summary.b_total_duration} |`,
    `| Tokens | ${summary.a_total_tokens} | ${summary.b_total_tokens} |`,
    ``,
    `## Flights`,
    ``,
    `| Flight | A Status | B Status | A Duration | B Duration | Match |`,
    `|--------|----------|----------|------------|------------|-------|`,
  ];

  for (const f of flights) {
    lines.push(
      `| ${f.flight_id} | ${f.a_status} | ${f.b_status} | ${f.a_duration_seconds ?? "-"} | ${f.b_duration_seconds ?? "-"} | ${f.status_match ? "yes" : "**NO**"} |`,
    );
  }

  lines.push(``);
  lines.push(`## Summary`);
  lines.push(`- Flights matching: ${summary.flights_match}/${flights.length}`);
  lines.push(`- Flights differing: ${summary.flights_differ}`);
  if (summary.nectar_diff_keys.length > 0) {
    lines.push(`- Nectar diff keys: ${summary.nectar_diff_keys.join(", ")}`);
  }

  return lines.join("\n");
}
