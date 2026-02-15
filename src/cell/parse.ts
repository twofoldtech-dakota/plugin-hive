import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────

const ParsedCellSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptance_criteria: z.array(z.string()),
});

export type ParsedCell = z.infer<typeof ParsedCellSchema>;

export type ParseCellsResult =
  | { success: true; cells: ParsedCell[] }
  | { success: false; error: string };

// ── Parser ──────────────────────────────────────────────────────────

/**
 * Extract and validate a JSON array of cells from Queen's CELLS_JSON output.
 *
 * Handles two formats:
 *  1. Single-line: `CELLS_JSON: [{"id": ...}, ...]`
 *  2. Multi-line: collects lines starting after `CELLS_JSON:` until valid JSON formed
 */
export function parseCellsJson(raw: string): ParseCellsResult {
  // Try to find a CELLS_JSON line and extract the JSON portion
  const lines = raw.split("\n");
  let jsonStr = "";
  let collecting = false;

  for (const line of lines) {
    if (!collecting) {
      const match = line.match(/^CELLS_JSON:\s*(.*)/);
      if (match) {
        const remainder = match[1].trim();
        if (remainder) {
          // Try single-line first
          const singleResult = tryParseAndValidate(remainder);
          if (singleResult.success) return singleResult;
          // Start multi-line collection
          jsonStr = remainder;
          collecting = true;
        } else {
          collecting = true;
        }
      }
    } else {
      jsonStr += line;
      const result = tryParseAndValidate(jsonStr);
      if (result.success) return result;
    }
  }

  // Final attempt with whatever we collected
  if (jsonStr) {
    return tryParseAndValidate(jsonStr);
  }

  return { success: false, error: "No CELLS_JSON found in output" };
}

function tryParseAndValidate(jsonStr: string): ParseCellsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { success: false, error: `Invalid JSON: ${jsonStr.slice(0, 100)}...` };
  }

  if (!Array.isArray(parsed)) {
    return { success: false, error: "CELLS_JSON must be a JSON array" };
  }

  if (parsed.length === 0) {
    return { success: false, error: "CELLS_JSON array is empty" };
  }

  const validated: ParsedCell[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const result = ParsedCellSchema.safeParse(parsed[i]);
    if (!result.success) {
      const issues = result.error.issues.map(e => e.message).join(", ");
      return { success: false, error: `Cell ${i}: ${issues}` };
    }
    validated.push(result.data);
  }

  return { success: true, cells: validated };
}
