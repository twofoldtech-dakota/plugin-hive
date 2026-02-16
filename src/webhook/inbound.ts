import type { IncomingMessage, ServerResponse } from "node:http";
import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { validateToken } from "./tokens.js";
import { createSwarmFromBlueprint } from "../swarm/create.js";
import type { InboundWebhookPermission } from "../types.js";

/**
 * Handle inbound webhook requests at /api/webhook/*.
 * Authenticated via Bearer token in Authorization header.
 */
export async function handleInboundWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  // Parse body
  const body = await readBody(req);
  const ip = req.headers["x-forwarded-for"] as string ?? req.socket.remoteAddress ?? "unknown";

  // Extract bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendJson(res, 401, { error: "Missing or invalid Authorization header" });
    return;
  }
  const rawToken = authHeader.slice(7);

  // Route to handler based on path
  const route = pathname.replace("/api/webhook/", "");

  switch (route) {
    case "swarm/start":
      await handleSwarmStart(rawToken, body, ip, res);
      break;
    case "gate/approve":
      await handleGateApprove(rawToken, body, ip, res);
      break;
    case "nectar/set":
      await handleNectarSet(rawToken, body, ip, res);
      break;
    case "swarm/stop":
      await handleSwarmStop(rawToken, body, ip, res);
      break;
    default:
      sendJson(res, 404, { error: `Unknown webhook route: ${route}` });
  }
}

async function handleSwarmStart(
  rawToken: string,
  body: Record<string, unknown>,
  ip: string,
  res: ServerResponse,
): Promise<void> {
  const auth = authenticateAndAudit(rawToken, "swarm:start", body, ip);
  if (!auth.valid) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  const blueprintId = body.blueprint_id as string;
  const task = body.task as string;
  const variables = body.variables as Record<string, string> | undefined;

  if (!blueprintId || !task) {
    recordAudit(auth.tokenId, "swarm:start", body, ip, "error");
    sendJson(res, 400, { error: "Missing required fields: blueprint_id, task" });
    return;
  }

  const result = createSwarmFromBlueprint(blueprintId, task, variables);
  if (!result.success) {
    recordAudit(auth.tokenId, "swarm:start", body, ip, "error");
    sendJson(res, 400, { error: result.error });
    return;
  }

  recordAudit(auth.tokenId, "swarm:start", body, ip, "success");

  emitEvent({
    eventType: "webhook.inbound",
    swarmId: result.data.id,
    payload: { action: "swarm:start", token_id: auth.tokenId, ip },
  });

  sendJson(res, 200, { success: true, swarm: result.data });
}

async function handleGateApprove(
  rawToken: string,
  body: Record<string, unknown>,
  ip: string,
  res: ServerResponse,
): Promise<void> {
  const auth = authenticateAndAudit(rawToken, "gate:approve", body, ip);
  if (!auth.valid) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  const flightId = body.flight_id as string;
  if (!flightId) {
    recordAudit(auth.tokenId, "gate:approve", body, ip, "error");
    sendJson(res, 400, { error: "Missing required field: flight_id" });
    return;
  }

  const flight = db.getFlight(flightId);
  if (!flight) {
    recordAudit(auth.tokenId, "gate:approve", body, ip, "error");
    sendJson(res, 404, { error: `Flight "${flightId}" not found` });
    return;
  }

  if (flight.status !== "gated") {
    recordAudit(auth.tokenId, "gate:approve", body, ip, "error");
    sendJson(res, 400, { error: `Flight is not gated (status: ${flight.status})` });
    return;
  }

  db.updateFlight(flightId, { status: "pending", gated_at: null });
  db.bumpEpoch();

  recordAudit(auth.tokenId, "gate:approve", body, ip, "success");

  emitEvent({
    eventType: "webhook.inbound",
    swarmId: flight.swarm_id,
    payload: { action: "gate:approve", flight_id: flightId, token_id: auth.tokenId, ip },
  });

  sendJson(res, 200, { success: true, flight_id: flightId, new_status: "pending" });
}

async function handleNectarSet(
  rawToken: string,
  body: Record<string, unknown>,
  ip: string,
  res: ServerResponse,
): Promise<void> {
  const auth = authenticateAndAudit(rawToken, "nectar:set", body, ip);
  if (!auth.valid) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  const swarmId = body.swarm_id as string;
  const key = body.key as string;
  const value = body.value as string;

  if (!swarmId || !key || value === undefined) {
    recordAudit(auth.tokenId, "nectar:set", body, ip, "error");
    sendJson(res, 400, { error: "Missing required fields: swarm_id, key, value" });
    return;
  }

  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    recordAudit(auth.tokenId, "nectar:set", body, ip, "error");
    sendJson(res, 404, { error: `Swarm "${swarmId}" not found` });
    return;
  }

  const nectar = JSON.parse(swarm.nectar) as Record<string, string>;
  nectar[key] = String(value);
  db.updateSwarm(swarmId, { nectar: JSON.stringify(nectar) });
  db.bumpEpoch();

  recordAudit(auth.tokenId, "nectar:set", body, ip, "success");

  emitEvent({
    eventType: "webhook.inbound",
    swarmId,
    payload: { action: "nectar:set", key, token_id: auth.tokenId, ip },
  });

  sendJson(res, 200, { success: true, swarm_id: swarmId, key, value: String(value) });
}

async function handleSwarmStop(
  rawToken: string,
  body: Record<string, unknown>,
  ip: string,
  res: ServerResponse,
): Promise<void> {
  const auth = authenticateAndAudit(rawToken, "swarm:stop", body, ip);
  if (!auth.valid) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  const swarmId = body.swarm_id as string;
  if (!swarmId) {
    recordAudit(auth.tokenId, "swarm:stop", body, ip, "error");
    sendJson(res, 400, { error: "Missing required field: swarm_id" });
    return;
  }

  const swarm = db.getSwarm(swarmId);
  if (!swarm) {
    recordAudit(auth.tokenId, "swarm:stop", body, ip, "error");
    sendJson(res, 404, { error: `Swarm "${swarmId}" not found` });
    return;
  }

  if (swarm.status !== "buzzing" && swarm.status !== "queued") {
    recordAudit(auth.tokenId, "swarm:stop", body, ip, "error");
    sendJson(res, 400, { error: `Cannot stop swarm in "${swarm.status}" status` });
    return;
  }

  db.updateSwarm(swarmId, { status: "cancelled" });
  const flights = db.getFlightsForSwarm(swarmId);
  for (const f of flights) {
    if (f.status === "pending" || f.status === "in_flight" || f.status === "waiting" || f.status === "gated") {
      db.updateFlight(f.id, { status: "failed" });
    }
  }
  db.bumpEpoch();

  recordAudit(auth.tokenId, "swarm:stop", body, ip, "success");

  emitEvent({
    eventType: "webhook.inbound",
    swarmId,
    payload: { action: "swarm:stop", token_id: auth.tokenId, ip },
  });

  sendJson(res, 200, { success: true, swarm_id: swarmId, new_status: "cancelled" });
}

// ── Helpers ───────────────────────────────────────────────────────────

function authenticateAndAudit(
  rawToken: string,
  permission: InboundWebhookPermission,
  body: Record<string, unknown>,
  ip: string,
): { valid: true; tokenId: string } | { valid: false; status: number; error: string; tokenId: string } {
  const auth = validateToken(rawToken, permission);
  if (!auth.valid) {
    // Try to find token for audit logging even on failure
    const tokenId = "unknown";
    recordAudit(tokenId, permission, body, ip, "denied");
    return { valid: false, status: 403, error: auth.error, tokenId };
  }
  return { valid: true, tokenId: auth.token.id };
}

function recordAudit(
  tokenId: string,
  action: string,
  payload: Record<string, unknown>,
  ip: string,
  status: "success" | "denied" | "error",
): void {
  try {
    db.insertWebhookAudit(tokenId, action, payload, ip, status);
  } catch {
    logger.warn("Failed to record webhook audit", { tokenId, action });
  }
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Get webhook audit log.
 */
export function getAuditLog(filters?: { token_id?: string; limit?: number }) {
  return db.getWebhookAuditLog(filters);
}
