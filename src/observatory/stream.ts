import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventRecord } from "../types.js";

interface SSEClient {
  id: string;
  res: ServerResponse;
  swarmFilter?: string;
  eventFilters?: string[];
}

const clients: Map<string, SSEClient> = new Map();
let clientCounter = 0;

/**
 * Handle SSE connection request at /api/stream.
 */
export function handleStreamRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const swarmId = url.searchParams.get("swarm_id") ?? undefined;
  const eventsParam = url.searchParams.get("events") ?? undefined;
  const eventFilters = eventsParam ? eventsParam.split(",").map(e => e.trim()) : undefined;

  const clientId = `sse-${++clientCounter}`;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ client_id: clientId })}\n\n`);

  const client: SSEClient = {
    id: clientId,
    res,
    swarmFilter: swarmId,
    eventFilters,
  };
  clients.set(clientId, client);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      clients.delete(clientId);
    }
  }, 30_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
}

/**
 * Broadcast an event to all connected SSE clients.
 * Called from emitEvent() after DB write.
 */
export function broadcastEvent(event: EventRecord): void {
  if (clients.size === 0) return;

  const data = JSON.stringify({
    id: event.id,
    event_type: event.event_type,
    swarm_id: event.swarm_id,
    payload: event.payload ? JSON.parse(event.payload) : null,
    created_at: event.created_at,
  });

  for (const client of clients.values()) {
    // Apply swarm filter
    if (client.swarmFilter && event.swarm_id !== client.swarmFilter) continue;

    // Apply event type filter
    if (client.eventFilters && !client.eventFilters.some(f => matchEventFilter(f, event.event_type))) continue;

    try {
      client.res.write(`event: ${event.event_type}\ndata: ${data}\n\n`);
    } catch {
      clients.delete(client.id);
    }
  }
}

function matchEventFilter(filter: string, eventType: string): boolean {
  if (filter === eventType) return true;
  if (filter.endsWith(".*")) {
    const prefix = filter.slice(0, -2);
    return eventType.startsWith(prefix + ".");
  }
  return false;
}

/**
 * Get current stream status.
 */
export function getStreamStatus(): { connected_clients: number; clients: Array<{ id: string; swarm_filter?: string; event_filters?: string[] }> } {
  return {
    connected_clients: clients.size,
    clients: Array.from(clients.values()).map(c => ({
      id: c.id,
      swarm_filter: c.swarmFilter,
      event_filters: c.eventFilters,
    })),
  };
}
