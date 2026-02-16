import * as db from "../db.js";
import { emitEvent } from "../lib/events.js";
import { logger } from "../lib/logger.js";
import { safeJsonParse } from "../lib/json.js";
import { createSwarmFromBlueprint } from "./create.js";
import type { SwarmTemplate, TemplateSaveResult, TemplateRunResult } from "../types.js";

export type SaveResult =
  | { success: true; result: TemplateSaveResult }
  | { success: false; error: string };

export type ListResult =
  | { success: true; templates: SwarmTemplate[] }
  | { success: false; error: string };

export type RunResult =
  | { success: true; result: TemplateRunResult }
  | { success: false; error: string };

export type DeleteResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Save a named swarm template.
 */
export function saveTemplate(
  name: string,
  blueprintId: string,
  description?: string,
  variables?: Record<string, string>,
  priority?: number,
): SaveResult {
  // Validate blueprint exists
  const bp = db.getBlueprint(blueprintId);
  if (!bp) {
    return { success: false, error: `Blueprint "${blueprintId}" is not installed` };
  }

  // Check for duplicate name
  const existing = db.getTemplate(name);
  if (existing) {
    return { success: false, error: `Template "${name}" already exists. Delete it first to re-save.` };
  }

  const template = db.insertTemplate(
    name,
    blueprintId,
    description,
    variables ? JSON.stringify(variables) : undefined,
    priority,
  );

  emitEvent({
    eventType: "template.created",
    payload: { template_name: name, blueprint_id: blueprintId },
  });

  logger.info("Template saved", { name, blueprintId });
  return {
    success: true,
    result: {
      template,
      message: `Template "${name}" saved for blueprint "${blueprintId}"`,
    },
  };
}

/**
 * List all saved templates.
 */
export function listSavedTemplates(): ListResult {
  const templates = db.listTemplates();
  return { success: true, templates };
}

/**
 * Delete a template by name.
 */
export function deleteTemplateByName(name: string): DeleteResult {
  const deleted = db.deleteTemplate(name);
  if (!deleted) {
    return { success: false, error: `Template "${name}" not found` };
  }

  emitEvent({
    eventType: "template.deleted",
    payload: { template_name: name },
  });

  logger.info("Template deleted", { name });
  return { success: true, message: `Template "${name}" deleted` };
}

/**
 * Start a swarm from a saved template with optional overrides.
 */
export function runTemplate(
  templateName: string,
  task: string,
  variableOverrides?: Record<string, string>,
  priorityOverride?: number,
): RunResult {
  const template = db.getTemplate(templateName);
  if (!template) {
    return { success: false, error: `Template "${templateName}" not found` };
  }

  // Merge variables: template defaults + overrides
  const templateVars = safeJsonParse<Record<string, string>>(template.variables, {});
  const mergedVars = { ...templateVars, ...variableOverrides };
  const priority = priorityOverride ?? template.priority;

  const result = createSwarmFromBlueprint(
    template.blueprint_id,
    task,
    Object.keys(mergedVars).length > 0 ? mergedVars : undefined,
    undefined,
    undefined,
    { priority },
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Increment usage count
  db.incrementTemplateUsage(templateName);

  logger.info("Template run", { templateName, swarmId: result.data.id });
  return {
    success: true,
    result: {
      template_name: templateName,
      swarm_id: result.data.id,
      swarm_number: result.data.number,
      status: result.data.status,
    },
  };
}
