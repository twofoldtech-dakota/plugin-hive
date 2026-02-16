import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import type { HiveProfileRecord } from "../types.js";

export interface ProfileResult {
  success: boolean;
  message: string;
  profile?: HiveProfileRecord;
}

export function createProfile(
  name: string,
  description?: string,
  overrides?: Record<string, string>,
): ProfileResult {
  const existing = db.getProfile(name);
  if (existing) {
    return { success: false, message: `Profile "${name}" already exists` };
  }

  const profile = db.insertProfile(name, description ?? null, JSON.stringify(overrides ?? {}));
  emitEvent({ eventType: "profile.created", payload: { name } });
  logger.info("Profile created", { name });
  return { success: true, message: `Profile "${name}" created`, profile };
}

export function listProfiles(): HiveProfileRecord[] {
  return db.listProfiles();
}

export function activateProfile(name: string): ProfileResult {
  const profile = db.getProfile(name);
  if (!profile) {
    return { success: false, message: `Profile "${name}" not found` };
  }

  // Store active profile name in hive_config
  db.setHiveConfig("active_profile", name);
  emitEvent({ eventType: "profile.activated", payload: { name } });
  logger.info("Profile activated", { name });
  return { success: true, message: `Profile "${name}" activated`, profile };
}

export function deactivateProfile(): ProfileResult {
  db.setHiveConfig("active_profile", "");
  return { success: true, message: "Profile deactivated (using defaults)" };
}

export function deleteProfile(name: string): ProfileResult {
  const existing = db.getProfile(name);
  if (!existing) {
    return { success: false, message: `Profile "${name}" not found` };
  }

  // If this profile is active, deactivate it
  const active = db.getHiveConfig("active_profile");
  if (active?.value === name) {
    db.setHiveConfig("active_profile", "");
  }

  db.deleteProfile(name);
  emitEvent({ eventType: "profile.deleted", payload: { name } });
  logger.info("Profile deleted", { name });
  return { success: true, message: `Profile "${name}" deleted` };
}

/**
 * Get config value with profile-aware override chain:
 * 1. Active profile overrides (if profile_enabled)
 * 2. hive_config table (default)
 */
export function getProfileAwareConfigValue(key: string): string | undefined {
  const profileEnabled = db.getHiveConfig("profile_enabled");
  if (profileEnabled?.value === "true") {
    const activeProfileName = db.getHiveConfig("active_profile");
    if (activeProfileName?.value) {
      const profile = db.getProfile(activeProfileName.value);
      if (profile) {
        const overrides = safeJsonParse<Record<string, string>>(profile.overrides, {});
        if (key in overrides) {
          return overrides[key];
        }
      }
    }
  }

  const record = db.getHiveConfig(key);
  return record?.value;
}

/**
 * Get config value for a specific swarm (respects swarm-level profile binding).
 */
export function getConfigValueForSwarm(key: string, swarmId: string): string | undefined {
  const swarm = db.getSwarm(swarmId);
  if (swarm?.profile) {
    const profile = db.getProfile(swarm.profile);
    if (profile) {
      const overrides = safeJsonParse<Record<string, string>>(profile.overrides, {});
      if (key in overrides) {
        return overrides[key];
      }
    }
  }

  return getProfileAwareConfigValue(key);
}
