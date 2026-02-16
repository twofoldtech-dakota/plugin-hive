import type {
  BeeRole,
  BeeSpec,
  BlueprintSpec,
  FlightClaimResult,
  SpawnRequest,
} from "../types.js";

// ── Tool Mapping ────────────────────────────────────────────────────

interface ToolConfig {
  tools: string[];
  disallowedTools: string[];
}

/**
 * Map a bee role to its allowed/disallowed MCP tools.
 * Follows the principle of least privilege per role.
 */
export function getToolsForRole(role: BeeRole): ToolConfig {
  switch (role) {
    case "analysis":
      return {
        tools: [
          "Read", "Glob", "Grep", "WebSearch", "WebFetch",
          "hive_flight_complete", "hive_flight_fail", "hive_flight_pulse",
        ],
        disallowedTools: ["Edit", "Write", "Bash", "NotebookEdit"],
      };
    case "coding":
      return {
        tools: [
          "Read", "Glob", "Grep", "Edit", "Write", "Bash",
          "hive_flight_complete", "hive_flight_fail", "hive_flight_pulse",
        ],
        disallowedTools: [],
      };
    case "verification":
      return {
        tools: [
          "Read", "Glob", "Grep", "Bash",
          "hive_flight_complete", "hive_flight_fail", "hive_flight_pulse",
        ],
        disallowedTools: ["Edit", "Write"],
      };
    case "testing":
      return {
        tools: [
          "Read", "Glob", "Grep", "Bash",
          "hive_flight_complete", "hive_flight_fail", "hive_flight_pulse",
        ],
        disallowedTools: ["Edit", "Write"],
      };
    case "pr":
      return {
        tools: [
          "Read", "Glob", "Grep", "Edit", "Write", "Bash",
          "hive_flight_complete", "hive_flight_fail", "hive_flight_pulse",
        ],
        disallowedTools: [],
      };
    case "scanning":
      return {
        tools: [
          "Read", "Glob", "Grep", "Bash",
          "hive_flight_complete", "hive_flight_fail", "hive_flight_pulse",
        ],
        disallowedTools: ["Edit", "Write"],
      };
  }
}

// ── Prompt Builder ──────────────────────────────────────────────────

/**
 * Build the markdown prompt for a bee subagent.
 */
export function buildBeePrompt(
  beeSpec: BeeSpec,
  claimResult: FlightClaimResult,
  blueprintId: string,
): string {
  const sections: string[] = [];

  // Identity
  sections.push(`# Bee: ${beeSpec.name || beeSpec.id}`);
  sections.push(`Role: ${beeSpec.role} | Blueprint: ${blueprintId}`);
  if (beeSpec.description) {
    sections.push(`\n${beeSpec.description}`);
  }

  // Flight context
  sections.push(`\n## Flight`);
  sections.push(`Flight ID: \`${claimResult.flight_id}\``);
  sections.push(`Swarm ID: \`${claimResult.swarm_id}\``);
  sections.push(`Type: ${claimResult.type}`);

  // Cell context for loop flights
  if (claimResult.cell) {
    sections.push(`\n## Current Cell`);
    sections.push(`Cell: ${claimResult.cell.cell_id} — ${claimResult.cell.title}`);
    sections.push(`Description: ${claimResult.cell.description}`);
    if (claimResult.cell.acceptance_criteria.length > 0) {
      sections.push(`\nAcceptance Criteria:`);
      for (const ac of claimResult.cell.acceptance_criteria) {
        sections.push(`- ${ac}`);
      }
    }
  }

  // Input (the resolved task)
  sections.push(`\n## Instructions\n`);
  sections.push(claimResult.resolved_input);

  // Expected output format
  sections.push(`\n## Expected Output Format\n`);
  sections.push(claimResult.expects);

  // Progress reporting
  sections.push(`\n## Progress Reporting\n`);
  sections.push(
    `For long-running tasks, periodically call \`hive_flight_pulse\` with flight_id \`${claimResult.flight_id}\`, a step label, progress (0.0–1.0), and an optional message.`,
  );

  // Completion instructions
  sections.push(`\n## Completion\n`);
  sections.push(
    `When done, call \`hive_flight_complete\` with flight_id \`${claimResult.flight_id}\` and your output in the KEY: value format described above.`,
  );
  sections.push(
    `If you encounter a fatal error, call \`hive_flight_fail\` with flight_id \`${claimResult.flight_id}\` and an error description.`,
  );

  return sections.join("\n");
}

// ── Full Spawn Request ──────────────────────────────────────────────

/**
 * Build a complete SpawnRequest for the coordinator.
 */
export function buildSpawnRequest(
  claimResult: FlightClaimResult,
  beeSpec: BeeSpec,
  blueprintSpec: BlueprintSpec,
): SpawnRequest {
  const toolConfig = getToolsForRole(beeSpec.role);
  const prompt = buildBeePrompt(beeSpec, claimResult, blueprintSpec.id);
  const model = beeSpec.model ?? blueprintSpec.polling?.model ?? "sonnet";

  const maxTurns = beeSpec.timeout_seconds
    ? Math.max(Math.floor(beeSpec.timeout_seconds / 10), 10)
    : 30;

  // Build a human-readable description for the coordinator
  let flightDescription = `${claimResult.type} flight (${beeSpec.role})`;
  if (claimResult.cell) {
    flightDescription = `implement cell: ${claimResult.cell.cell_id} (${beeSpec.role})`;
  }

  return {
    swarmId: claimResult.swarm_id,
    beeId: beeSpec.id,
    flightId: claimResult.flight_id,
    flightDescription,
    prompt,
    model,
    tools: toolConfig.tools,
    disallowedTools: toolConfig.disallowedTools,
    maxTurns,
    cell: claimResult.cell
      ? {
          id: claimResult.cell.id,
          cellId: claimResult.cell.cell_id,
          title: claimResult.cell.title,
        }
      : undefined,
  };
}
