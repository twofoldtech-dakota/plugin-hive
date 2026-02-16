import type { IncomingMessage, ServerResponse } from "node:http";
import * as db from "../db.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { getQueueStatus } from "../concurrency/queue-status.js";
import { getStorageStatus } from "../archive/storage.js";
import { generateSwarmReport } from "../report/generate.js";
import { getChainStatus, listChains as listChainsQuery } from "../chain/status.js";
import { getFleetMetrics } from "../metrics/fleet.js";
import { getBudgetStatus } from "../budget/budget.js";
import { getCacheStatus } from "../cache/cache.js";
import { compareSwarms } from "../compare/compare.js";
import { computeDAG } from "./dag.js";
import { handleStreamRequest, getStreamStatus } from "./stream.js";
import { handleInboundWebhook, getAuditLog } from "../webhook/inbound.js";
import { searchRegistry } from "../registry/client.js";
import { listSchedulesQuery, getScheduleHistoryQuery } from "../scheduler/manager.js";
import { listCircuits } from "../resilience/circuit-breaker.js";
import { listDeadLettersQuery } from "../resilience/dlq.js";
import { computeHealthScore, getHealthHistoryQuery } from "./health.js";
import type { SwarmStatus, CircuitState } from "../types.js";

const VALID_SWARM_STATUSES = new Set<string>(["buzzing", "paused", "blocked", "completed", "failed", "cancelled", "scheduled", "queued"]);

/**
 * Handle an incoming HTTP request for the Observatory API.
 */
export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  try {
    // GET / — Dashboard SPA
    if (path === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
      return;
    }

    // GET /api/blueprints
    if (path === "/api/blueprints" && req.method === "GET") {
      json(res, db.listBlueprints());
      return;
    }

    // GET /api/swarms
    if (path === "/api/swarms" && req.method === "GET") {
      const statusParam = url.searchParams.get("status");
      const status = statusParam && VALID_SWARM_STATUSES.has(statusParam) ? statusParam as SwarmStatus : undefined;
      const blueprint = url.searchParams.get("blueprint") ?? undefined;
      const swarms = db.listSwarms({
        status,
        blueprint_id: blueprint,
        limit: 50,
      });
      json(res, swarms);
      return;
    }

    // GET /api/swarms/:id/timing
    const timingMatch = path.match(/^\/api\/swarms\/([^/]+)\/timing$/);
    if (timingMatch && req.method === "GET") {
      const swarm = db.findSwarm(timingMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const flightDurations = db.getFlightDurations(swarm.id);
      const cellDurations = db.getCellDurations(swarm.id);
      json(res, { swarm_id: swarm.id, flights: flightDurations, cells: cellDurations });
      return;
    }

    // GET /api/swarms/:id/report
    const reportMatch = path.match(/^\/api\/swarms\/([^/]+)\/report$/);
    if (reportMatch && req.method === "GET") {
      const swarm = db.findSwarm(reportMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const result = generateSwarmReport(swarm.id);
      if (!result.success) {
        json(res, { error: result.error });
        return;
      }
      json(res, { report: result.report, markdown: result.markdown });
      return;
    }

    // GET /api/swarms/:id/traces
    const tracesMatch = path.match(/^\/api\/swarms\/([^/]+)\/traces$/);
    if (tracesMatch && req.method === "GET") {
      const swarm = db.findSwarm(tracesMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const traces = db.getTracesForSwarm(swarm.id);
      json(res, traces);
      return;
    }

    // GET /api/swarms/:id/snapshots
    const snapshotsMatch = path.match(/^\/api\/swarms\/([^/]+)\/snapshots$/);
    if (snapshotsMatch && req.method === "GET") {
      const swarm = db.findSwarm(snapshotsMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const snapshots = db.getSnapshotsForSwarm(swarm.id);
      json(res, snapshots.map(s => ({ id: s.id, type: s.snapshot_type, created_at: s.created_at })));
      return;
    }

    // GET /api/swarms/:id
    const swarmMatch = path.match(/^\/api\/swarms\/([^/]+)$/);
    if (swarmMatch && req.method === "GET") {
      const swarm = db.findSwarm(swarmMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const flights = db.getFlightsForSwarm(swarm.id);
      json(res, { swarm, flights });
      return;
    }

    // GET /api/swarms/:id/cells
    const cellsMatch = path.match(/^\/api\/swarms\/([^/]+)\/cells$/);
    if (cellsMatch && req.method === "GET") {
      const swarm = db.findSwarm(cellsMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const cells = db.getCellsForSwarm(swarm.id);
      json(res, cells);
      return;
    }

    // GET /api/swarms/:id/events
    const eventsMatch = path.match(/^\/api\/swarms\/([^/]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      const swarm = db.findSwarm(eventsMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      const events = db.getEventsForSwarm(swarm.id, limit);
      json(res, events);
      return;
    }

    // GET /api/beekeeper/status
    if (path === "/api/beekeeper/status" && req.method === "GET") {
      const checks = db.getRecentBeekeeperChecks(1);
      const stuck = db.getStuckFlights(35);
      const stalled = db.getStalledSwarms(30);
      json(res, {
        latest_check: checks[0] ?? null,
        current_stuck_flights: stuck.length,
        current_stalled_swarms: stalled.length,
      });
      return;
    }

    // GET /api/beekeeper/checks
    if (path === "/api/beekeeper/checks" && req.method === "GET") {
      const checks = db.getRecentBeekeeperChecks(20);
      json(res, checks);
      return;
    }

    // GET /api/swarms/:id/pulses
    const pulsesMatch = path.match(/^\/api\/swarms\/([^/]+)\/pulses$/);
    if (pulsesMatch && req.method === "GET") {
      const swarm = db.findSwarm(pulsesMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const pulses = db.getPulsesForSwarm(swarm.id);
      json(res, pulses);
      return;
    }

    // GET /api/swarms/:id/usage
    const usageMatch = path.match(/^\/api\/swarms\/([^/]+)\/usage$/);
    if (usageMatch && req.method === "GET") {
      const swarm = db.findSwarm(usageMatch[1]);
      if (!swarm) {
        notFound(res, "Swarm not found");
        return;
      }
      const usage = db.getUsageForSwarm(swarm.id);
      json(res, usage);
      return;
    }

    // GET /api/bees/stats
    if (path === "/api/bees/stats" && req.method === "GET") {
      const stats = db.getAllBeeStats();
      json(res, stats);
      return;
    }

    // ── Phase 13: New API endpoints ───────────────────────────────────

    // GET /api/queue
    if (path === "/api/queue" && req.method === "GET") {
      json(res, getQueueStatus());
      return;
    }

    // GET /api/archives
    if (path === "/api/archives" && req.method === "GET") {
      json(res, db.listSwarmArchives());
      return;
    }

    // GET /api/archives/:id
    const archiveMatch = path.match(/^\/api\/archives\/([^/]+)$/);
    if (archiveMatch && req.method === "GET") {
      const archive = db.getSwarmArchive(archiveMatch[1]);
      if (!archive) {
        notFound(res, "Archive not found");
        return;
      }
      json(res, archive);
      return;
    }

    // GET /api/config
    if (path === "/api/config" && req.method === "GET") {
      json(res, db.getAllHiveConfig());
      return;
    }

    // GET /api/storage
    if (path === "/api/storage" && req.method === "GET") {
      json(res, getStorageStatus());
      return;
    }

    // GET /api/chains
    if (path === "/api/chains" && req.method === "GET") {
      const result = listChainsQuery();
      json(res, result.success ? result.chains : []);
      return;
    }

    // GET /api/chains/:id
    const chainMatch = path.match(/^\/api\/chains\/([^/]+)$/);
    if (chainMatch && req.method === "GET") {
      const result = getChainStatus(chainMatch[1]);
      if (!result.success) {
        notFound(res, result.error);
        return;
      }
      json(res, result.data);
      return;
    }

    // GET /api/metrics/fleet
    if (path === "/api/metrics/fleet" && req.method === "GET") {
      const period = url.searchParams.get("period") ?? "30d";
      const result = getFleetMetrics(period);
      if (!result.success) {
        json(res, { error: result.error });
        return;
      }
      json(res, result.metrics);
      return;
    }

    // ── Phase 15: New API endpoints ───────────────────────────────────

    // GET /api/cache
    if (path === "/api/cache" && req.method === "GET") {
      json(res, getCacheStatus());
      return;
    }

    // GET /api/templates
    if (path === "/api/templates" && req.method === "GET") {
      json(res, db.listTemplates());
      return;
    }

    // GET /api/swarms/:id/budget
    const budgetMatch = path.match(/^\/api\/swarms\/([^/]+)\/budget$/);
    if (budgetMatch && req.method === "GET") {
      const result = getBudgetStatus(budgetMatch[1]);
      if (!result.success) {
        notFound(res, result.error);
        return;
      }
      json(res, result.status);
      return;
    }

    // GET /api/compare/:idA/:idB
    const compareMatch = path.match(/^\/api\/compare\/([^/]+)\/([^/]+)$/);
    if (compareMatch && req.method === "GET") {
      const result = compareSwarms(compareMatch[1], compareMatch[2]);
      if (!result.success) {
        notFound(res, result.error);
        return;
      }
      json(res, result.comparison);
      return;
    }

    // ── Phase 16-17: New API endpoints ──────────────────────────────

    // GET /api/swarms/:id/dag
    const dagMatch = path.match(/^\/api\/swarms\/([^/]+)\/dag$/);
    if (dagMatch && req.method === "GET") {
      const result = computeDAG(dagMatch[1]);
      if (!result.success) {
        notFound(res, result.error);
        return;
      }
      json(res, result.dag);
      return;
    }

    // GET /api/stream — SSE endpoint
    if (path === "/api/stream" && req.method === "GET") {
      handleStreamRequest(req, res);
      return;
    }

    // GET /api/stream/status
    if (path === "/api/stream/status" && req.method === "GET") {
      json(res, getStreamStatus());
      return;
    }

    // GET /api/registry
    if (path === "/api/registry" && req.method === "GET") {
      const query = url.searchParams.get("q") ?? "";
      const registryUrl = url.searchParams.get("registry") ?? undefined;
      json(res, searchRegistry(query, registryUrl));
      return;
    }

    // GET /api/registry/search
    if (path === "/api/registry/search" && req.method === "GET") {
      const query = url.searchParams.get("q") ?? "";
      json(res, searchRegistry(query));
      return;
    }

    // GET /api/blueprints/:id/ratings
    const ratingsMatch = path.match(/^\/api\/blueprints\/([^/]+)\/ratings$/);
    if (ratingsMatch && req.method === "GET") {
      json(res, db.getBlueprintRatings(ratingsMatch[1]));
      return;
    }

    // GET /api/webhook/audit
    if (path === "/api/webhook/audit" && req.method === "GET") {
      const tokenId = url.searchParams.get("token_id") ?? undefined;
      const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : 50;
      json(res, getAuditLog({ token_id: tokenId, limit }));
      return;
    }

    // POST /api/webhook/* — Inbound webhooks
    if (path.startsWith("/api/webhook/") && req.method === "POST") {
      handleInboundWebhook(req, res, path).catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }));
      });
      return;
    }

    // ── Phase 18: New API endpoints ──────────────────────────────

    // GET /api/schedules
    if (path === "/api/schedules" && req.method === "GET") {
      const blueprintId = url.searchParams.get("blueprint_id") ?? undefined;
      const enabledParam = url.searchParams.get("enabled");
      const enabled = enabledParam !== null ? enabledParam === "true" : undefined;
      json(res, listSchedulesQuery({ blueprint_id: blueprintId, enabled }));
      return;
    }

    // GET /api/schedules/:id/history
    const schedHistMatch = path.match(/^\/api\/schedules\/([^/]+)\/history$/);
    if (schedHistMatch && req.method === "GET") {
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      const result = getScheduleHistoryQuery(schedHistMatch[1], limit);
      if (!result.success) {
        notFound(res, result.error!);
        return;
      }
      json(res, { schedule: result.schedule, runs: result.runs });
      return;
    }

    // GET /api/circuits
    if (path === "/api/circuits" && req.method === "GET") {
      const stateParam = url.searchParams.get("state") as CircuitState | null;
      json(res, listCircuits(stateParam ?? undefined));
      return;
    }

    // GET /api/dlq
    if (path === "/api/dlq" && req.method === "GET") {
      const swarmId = url.searchParams.get("swarm_id") ?? undefined;
      const status = url.searchParams.get("status") ?? undefined;
      json(res, listDeadLettersQuery({ swarm_id: swarmId, status }));
      return;
    }

    // GET /api/tags/:swarm_id
    const tagsMatch = path.match(/^\/api\/tags\/([^/]+)$/);
    if (tagsMatch && req.method === "GET") {
      const swarm = db.findSwarm(tagsMatch[1]);
      if (!swarm) { notFound(res, "Swarm not found"); return; }
      json(res, db.getSwarmTags(swarm.id));
      return;
    }

    // GET /api/search
    if (path === "/api/search" && req.method === "GET") {
      const query = url.searchParams.get("query") ?? undefined;
      const status = url.searchParams.get("status") as import("../types.js").SwarmStatus | undefined;
      const blueprintId = url.searchParams.get("blueprint_id") ?? undefined;
      const from = url.searchParams.get("from") ?? undefined;
      const to = url.searchParams.get("to") ?? undefined;
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      json(res, db.searchSwarms({ query, status, blueprint_id: blueprintId, from, to, limit }));
      return;
    }

    // GET /api/profiles
    if (path === "/api/profiles" && req.method === "GET") {
      json(res, db.listProfiles());
      return;
    }

    // GET /api/memory/:bee_id
    const memoryMatch = path.match(/^\/api\/memory\/([^/]+)$/);
    if (memoryMatch && req.method === "GET") {
      const namespace = url.searchParams.get("namespace") ?? undefined;
      json(res, db.getBeeMemories(memoryMatch[1], namespace));
      return;
    }

    // GET /api/memory/stats
    if (path === "/api/memory/stats" && req.method === "GET") {
      json(res, db.getBeeMemoryStats());
      return;
    }

    // GET /api/playbooks
    if (path === "/api/playbooks" && req.method === "GET") {
      json(res, db.listPlaybooks());
      return;
    }

    // GET /api/playbook-history
    if (path === "/api/playbook-history" && req.method === "GET") {
      const playbookId = url.searchParams.get("playbook_id") ?? undefined;
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      json(res, db.getPlaybookExecutions(playbookId, limit));
      return;
    }

    // GET /api/health
    if (path === "/api/health" && req.method === "GET") {
      json(res, computeHealthScore());
      return;
    }

    // GET /api/health/history
    if (path === "/api/health/history" && req.method === "GET") {
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      json(res, getHealthHistoryQuery(limit));
      return;
    }

    // 404
    notFound(res, "Not found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }));
  }
}

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function notFound(res: ServerResponse, message: string): void {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}
