import type { IncomingMessage, ServerResponse } from "node:http";
import * as db from "../db.js";
import { DASHBOARD_HTML } from "./dashboard.js";

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
      const status = url.searchParams.get("status") as any;
      const blueprint = url.searchParams.get("blueprint") ?? undefined;
      const swarms = db.listSwarms({
        status: status || undefined,
        blueprint_id: blueprint,
        limit: 50,
      });
      json(res, swarms);
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
