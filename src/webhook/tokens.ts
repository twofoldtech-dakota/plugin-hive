import { createHash, randomBytes } from "node:crypto";
import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import type { InboundWebhookPermission, WebhookTokenRecord } from "../types.js";

const VALID_PERMISSIONS: InboundWebhookPermission[] = [
  "swarm:start",
  "gate:approve",
  "nectar:set",
  "swarm:stop",
];

/**
 * Hash a raw token using SHA-256.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generate a new raw token (32 random bytes, hex-encoded).
 */
export function generateToken(): string {
  return `hive_${randomBytes(32).toString("hex")}`;
}

/**
 * Create a new webhook token.
 * Returns the raw token (shown only once) and the record.
 */
export function createToken(
  name: string,
  permissions: InboundWebhookPermission[],
  expiresAt?: string,
): { success: true; token: string; record: WebhookTokenRecord } | { success: false; error: string } {
  // Validate permissions
  for (const perm of permissions) {
    if (!VALID_PERMISSIONS.includes(perm)) {
      return { success: false, error: `Invalid permission: "${perm}". Valid: ${VALID_PERMISSIONS.join(", ")}` };
    }
  }

  if (permissions.length === 0) {
    return { success: false, error: "At least one permission is required" };
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);

  const record = db.insertWebhookToken(name, tokenHash, permissions, expiresAt);

  emitEvent({
    eventType: "webhook.token_created",
    payload: { token_id: record.id, name, permissions },
  });

  logger.info("Webhook token created", { tokenId: record.id, name });

  return { success: true, token: rawToken, record };
}

/**
 * Validate a bearer token from an inbound request.
 * Returns the token record if valid, or an error.
 */
export function validateToken(
  rawToken: string,
  requiredPermission: InboundWebhookPermission,
): { valid: true; token: WebhookTokenRecord } | { valid: false; error: string } {
  const tokenHash = hashToken(rawToken);
  const record = db.getWebhookTokenByHash(tokenHash);

  if (!record) {
    return { valid: false, error: "Invalid token" };
  }

  // Check expiry
  if (record.expires_at) {
    const expiry = new Date(record.expires_at.replace(" ", "T") + "Z");
    if (expiry < new Date()) {
      return { valid: false, error: "Token expired" };
    }
  }

  // Check permission
  const permissions: string[] = JSON.parse(record.permissions);
  if (!permissions.includes(requiredPermission)) {
    return { valid: false, error: `Token lacks permission: ${requiredPermission}` };
  }

  return { valid: true, token: record };
}

/**
 * List all active (non-revoked) tokens.
 */
export function listTokens(): WebhookTokenRecord[] {
  return db.listWebhookTokens();
}

/**
 * Revoke a webhook token.
 */
export function revokeToken(tokenId: string): { success: boolean; error?: string } {
  const revoked = db.revokeWebhookToken(tokenId);
  if (!revoked) {
    return { success: false, error: `Token "${tokenId}" not found or already revoked` };
  }

  emitEvent({
    eventType: "webhook.token_revoked",
    payload: { token_id: tokenId },
  });

  logger.info("Webhook token revoked", { tokenId });
  return { success: true };
}
