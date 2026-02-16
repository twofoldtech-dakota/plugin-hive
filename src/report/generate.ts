import * as db from "../db.js";
import { safeJsonParse } from "../lib/json.js";
import { getSwarmAnalytics, type SwarmAnalytics } from "../swarm/analytics.js";

export interface SwarmReport {
  swarm: {
    id: string;
    number: number;
    blueprint_id: string;
    task: string;
    status: string;
    created_at: string;
    updated_at: string;
    chain_id: string | null;
  };
  summary: {
    total_flights: number;
    completed_flights: number;
    failed_flights: number;
    total_cells: number;
    completed_cells: number;
    total_duration_seconds: number;
  };
  flight_timeline: Array<{
    flight_id: string;
    bee_id: string;
    status: string;
    type: string;
    duration_seconds: number | null;
    produces: string[];
    requires: string[];
    started_at: string | null;
    completed_at: string | null;
  }>;
  cell_results: Array<{
    cell_id: string;
    title: string;
    status: string;
    duration_seconds: number | null;
  }>;
  nectar: Record<string, string>;
  analytics: SwarmAnalytics | null;
}

export type ReportResult =
  | { success: true; report: SwarmReport; markdown: string }
  | { success: false; error: string };

/**
 * Generate a structured report for a swarm.
 */
export function generateSwarmReport(swarmId: string): ReportResult {
  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    return { success: false, error: `Swarm "${swarmId}" not found` };
  }

  const flights = db.getFlightsForSwarm(swarmId);
  const regularFlights = flights.filter(f => !f.verify_meta);
  const cells = db.getCellsForSwarm(swarmId);
  const flightDurations = db.getFlightDurations(swarmId);
  const cellDurations = db.getCellDurations(swarmId);
  const nectar = safeJsonParse<Record<string, string>>(swarm.nectar, {});

  const durationMap = new Map(flightDurations.map(d => [d.flight_id, d.duration_seconds]));
  const cellDurationMap = new Map(cellDurations.map(d => [d.cell_id, d.duration_seconds]));

  const totalDuration = flightDurations.reduce((sum, f) => sum + (f.duration_seconds ?? 0), 0);

  const flightTimeline = regularFlights.map(f => ({
    flight_id: f.flight_id,
    bee_id: f.bee_id,
    status: f.status,
    type: f.type,
    duration_seconds: durationMap.get(f.flight_id) ?? null,
    produces: f.produces ? safeJsonParse<string[]>(f.produces, []) : [],
    requires: f.requires ? safeJsonParse<string[]>(f.requires, []) : [],
    started_at: f.started_at,
    completed_at: f.completed_at,
  }));

  const cellResults = cells.map(c => ({
    cell_id: c.cell_id,
    title: c.title,
    status: c.status,
    duration_seconds: cellDurationMap.get(c.cell_id) ?? null,
  }));

  const analyticsResult = getSwarmAnalytics(swarmId);
  const analytics = analyticsResult.success ? analyticsResult.data : null;

  const report: SwarmReport = {
    swarm: {
      id: swarm.id,
      number: swarm.swarm_number,
      blueprint_id: swarm.blueprint_id,
      task: swarm.task,
      status: swarm.status,
      created_at: swarm.created_at,
      updated_at: swarm.updated_at,
      chain_id: swarm.chain_id,
    },
    summary: {
      total_flights: regularFlights.length,
      completed_flights: regularFlights.filter(f => f.status === "done").length,
      failed_flights: regularFlights.filter(f => f.status === "failed").length,
      total_cells: cells.length,
      completed_cells: cells.filter(c => c.status === "done").length,
      total_duration_seconds: totalDuration,
    },
    flight_timeline: flightTimeline,
    cell_results: cellResults,
    nectar,
    analytics,
  };

  const markdown = formatReportMarkdown(report);
  return { success: true, report, markdown };
}

function formatReportMarkdown(report: SwarmReport): string {
  const lines: string[] = [];

  lines.push(`# Swarm Report: #${report.swarm.number}`);
  lines.push("");
  lines.push(`**Blueprint:** ${report.swarm.blueprint_id}`);
  lines.push(`**Task:** ${report.swarm.task}`);
  lines.push(`**Status:** ${report.swarm.status}`);
  lines.push(`**Created:** ${report.swarm.created_at}`);
  if (report.swarm.chain_id) {
    lines.push(`**Chain:** ${report.swarm.chain_id}`);
  }
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Flights | ${report.summary.completed_flights}/${report.summary.total_flights} completed |`);
  lines.push(`| Failed | ${report.summary.failed_flights} |`);
  lines.push(`| Cells | ${report.summary.completed_cells}/${report.summary.total_cells} completed |`);
  lines.push(`| Duration | ${report.summary.total_duration_seconds}s |`);
  lines.push("");

  // Flight Timeline
  if (report.flight_timeline.length > 0) {
    lines.push("## Flight Timeline");
    lines.push("");
    lines.push(`| Flight | Bee | Status | Type | Duration |`);
    lines.push(`|--------|-----|--------|------|----------|`);
    for (const f of report.flight_timeline) {
      const dur = f.duration_seconds !== null ? `${f.duration_seconds}s` : "-";
      lines.push(`| ${f.flight_id} | ${f.bee_id} | ${f.status} | ${f.type} | ${dur} |`);
    }
    lines.push("");
  }

  // Cells
  if (report.cell_results.length > 0) {
    lines.push("## Cells");
    lines.push("");
    lines.push(`| Cell | Title | Status | Duration |`);
    lines.push(`|------|-------|--------|----------|`);
    for (const c of report.cell_results) {
      const dur = c.duration_seconds !== null ? `${c.duration_seconds}s` : "-";
      lines.push(`| ${c.cell_id} | ${c.title} | ${c.status} | ${dur} |`);
    }
    lines.push("");
  }

  // Nectar
  const nectarKeys = Object.keys(report.nectar);
  if (nectarKeys.length > 0) {
    lines.push("## Nectar");
    lines.push("");
    for (const key of nectarKeys) {
      const val = report.nectar[key];
      const display = val.length > 100 ? val.slice(0, 100) + "..." : val;
      lines.push(`- **${key}:** ${display}`);
    }
    lines.push("");
  }

  // Analytics
  if (report.analytics) {
    lines.push("## Analytics");
    lines.push("");
    if (report.analytics.flights.bottleneck) {
      lines.push(`**Bottleneck:** ${report.analytics.flights.bottleneck.flight_id} (${report.analytics.flights.bottleneck.duration_seconds}s)`);
    }
    lines.push(`**Parallelism Ratio:** ${report.analytics.parallelism_ratio}`);
    if (report.analytics.usage) {
      lines.push(`**Total Tokens:** ${report.analytics.usage.total_tokens}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
