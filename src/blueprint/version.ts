import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { safeJsonParse } from "../lib/json.js";
import type { BlueprintSpec, BlueprintDiff, BlueprintVersionRecord } from "../types.js";

/**
 * Record a new version of a blueprint on install/reinstall.
 * Computes diff against previous version if one exists.
 */
export function recordVersion(blueprintId: string, newSpec: BlueprintSpec): BlueprintVersionRecord {
  const latestNum = db.getLatestBlueprintVersionNumber(blueprintId);
  const newVersionNum = latestNum + 1;

  let changesSummary: string | undefined;
  if (latestNum > 0) {
    const prevVersion = db.getBlueprintVersion(blueprintId, latestNum);
    if (prevVersion) {
      const prevSpec = safeJsonParse<BlueprintSpec | null>(prevVersion.spec, null);
      if (prevSpec) {
        const diff = computeDiff(prevSpec, newSpec);
        changesSummary = summarizeDiff(diff);
      }
    }
  } else {
    changesSummary = "Initial version";
  }

  const record = db.insertBlueprintVersion(
    blueprintId,
    newVersionNum,
    JSON.stringify(newSpec),
    changesSummary,
  );

  emitEvent({
    eventType: "blueprint.versioned",
    payload: {
      blueprint_id: blueprintId,
      version_number: newVersionNum,
      changes_summary: changesSummary,
    },
  });

  return record;
}

/**
 * Compute a structural diff between two blueprint specs.
 */
export function computeDiff(oldSpec: BlueprintSpec, newSpec: BlueprintSpec): BlueprintDiff {
  const oldBeeIds = new Set(oldSpec.bees.map(b => b.id));
  const newBeeIds = new Set(newSpec.bees.map(b => b.id));

  const beesAdded = newSpec.bees.filter(b => !oldBeeIds.has(b.id)).map(b => b.id);
  const beesRemoved = oldSpec.bees.filter(b => !newBeeIds.has(b.id)).map(b => b.id);
  const beesChanged: string[] = [];
  for (const newBee of newSpec.bees) {
    if (oldBeeIds.has(newBee.id)) {
      const oldBee = oldSpec.bees.find(b => b.id === newBee.id);
      if (oldBee && JSON.stringify(oldBee) !== JSON.stringify(newBee)) {
        beesChanged.push(newBee.id);
      }
    }
  }

  const oldFlightIds = new Set(oldSpec.flights.map(f => f.id));
  const newFlightIds = new Set(newSpec.flights.map(f => f.id));

  const flightsAdded = newSpec.flights.filter(f => !oldFlightIds.has(f.id)).map(f => f.id);
  const flightsRemoved = oldSpec.flights.filter(f => !newFlightIds.has(f.id)).map(f => f.id);
  const flightsChanged: string[] = [];
  for (const newFlight of newSpec.flights) {
    if (oldFlightIds.has(newFlight.id)) {
      const oldFlight = oldSpec.flights.find(f => f.id === newFlight.id);
      if (oldFlight && JSON.stringify(oldFlight) !== JSON.stringify(newFlight)) {
        flightsChanged.push(newFlight.id);
      }
    }
  }

  const otherChanges: string[] = [];
  if (oldSpec.name !== newSpec.name) otherChanges.push("name changed");
  if (oldSpec.version !== newSpec.version) otherChanges.push("version changed");
  if (oldSpec.description !== newSpec.description) otherChanges.push("description changed");
  if (JSON.stringify(oldSpec.nectar) !== JSON.stringify(newSpec.nectar)) otherChanges.push("nectar changed");
  if (JSON.stringify(oldSpec.inputs) !== JSON.stringify(newSpec.inputs)) otherChanges.push("inputs changed");
  if (JSON.stringify(oldSpec.beekeeper) !== JSON.stringify(newSpec.beekeeper)) otherChanges.push("beekeeper config changed");
  if (JSON.stringify(oldSpec.triggers) !== JSON.stringify(newSpec.triggers)) otherChanges.push("triggers changed");
  if (JSON.stringify(oldSpec.polling) !== JSON.stringify(newSpec.polling)) otherChanges.push("polling config changed");
  if (JSON.stringify(oldSpec.concurrency) !== JSON.stringify(newSpec.concurrency)) otherChanges.push("concurrency config changed");

  return {
    from_version: 0, // Caller should set these
    to_version: 0,
    bees_added: beesAdded,
    bees_removed: beesRemoved,
    bees_changed: beesChanged,
    flights_added: flightsAdded,
    flights_removed: flightsRemoved,
    flights_changed: flightsChanged,
    other_changes: otherChanges,
  };
}

/**
 * Get the version history for a blueprint.
 */
export function getBlueprintHistory(blueprintId: string): { success: true; versions: BlueprintVersionRecord[] } | { success: false; error: string } {
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" not found` };
  }

  const versions = db.getBlueprintVersions(blueprintId);
  return { success: true, versions };
}

/**
 * Diff between two versions of a blueprint.
 * Defaults to latest two versions if not specified.
 */
export function diffBlueprintVersions(
  blueprintId: string,
  fromVersion?: number,
  toVersion?: number,
): { success: true; diff: BlueprintDiff } | { success: false; error: string } {
  const versions = db.getBlueprintVersions(blueprintId);
  if (versions.length < 2) {
    return { success: false, error: "Need at least 2 versions to diff" };
  }

  const from = fromVersion ?? versions[versions.length - 2].version_number;
  const to = toVersion ?? versions[versions.length - 1].version_number;

  const fromVer = db.getBlueprintVersion(blueprintId, from);
  const toVer = db.getBlueprintVersion(blueprintId, to);

  if (!fromVer) {
    return { success: false, error: `Version ${from} not found` };
  }
  if (!toVer) {
    return { success: false, error: `Version ${to} not found` };
  }

  const fromSpec = safeJsonParse<BlueprintSpec | null>(fromVer.spec, null);
  const toSpec = safeJsonParse<BlueprintSpec | null>(toVer.spec, null);

  if (!fromSpec || !toSpec) {
    return { success: false, error: "Failed to parse version specs" };
  }

  const diff = computeDiff(fromSpec, toSpec);
  diff.from_version = from;
  diff.to_version = to;

  return { success: true, diff };
}

function summarizeDiff(diff: BlueprintDiff): string {
  const parts: string[] = [];
  if (diff.bees_added.length > 0) parts.push(`+${diff.bees_added.length} bee(s)`);
  if (diff.bees_removed.length > 0) parts.push(`-${diff.bees_removed.length} bee(s)`);
  if (diff.bees_changed.length > 0) parts.push(`~${diff.bees_changed.length} bee(s)`);
  if (diff.flights_added.length > 0) parts.push(`+${diff.flights_added.length} flight(s)`);
  if (diff.flights_removed.length > 0) parts.push(`-${diff.flights_removed.length} flight(s)`);
  if (diff.flights_changed.length > 0) parts.push(`~${diff.flights_changed.length} flight(s)`);
  if (diff.other_changes.length > 0) parts.push(diff.other_changes.join(", "));
  return parts.length > 0 ? parts.join("; ") : "No changes";
}
