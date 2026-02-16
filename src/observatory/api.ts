import type { IncomingMessage, ServerResponse } from "node:http";
import * as db from "../db.js";
import { DASHBOARD_HTML } from "./dashboard.js";
import { getQueueStatus } from "../concurrency/queue-status.js";
import { getStorageStatus } from "../archive/storage.js";
import { generateSwarmReport } from "../report/generate.js";
import { getChainStatus, listChains as listChainsQuery } from "../chain/status.js";
import { getFleetMetrics } from "../metrics/fleet.js";
import type { SwarmStatus } from "../types.js";

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
