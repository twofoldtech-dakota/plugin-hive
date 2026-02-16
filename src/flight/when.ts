/**
 * Evaluate a `when:` clause against nectar values.
 *
 * Supported forms:
 *   - `{{key}}`          — truthy (key exists and is non-empty)
 *   - `{{key}} == value`  — equality
 *   - `{{key}} != value`  — inequality
 */
export function evaluateWhen(clause: string, nectar: Record<string, string>): boolean {
  // First resolve {{key}} references in the clause
  const resolved = clause.replace(/\{\{(\w+)\}\}/g, (_, key) => nectar[key] ?? "");

  // Check for equality: `resolved_value == expected`
  const eqMatch = resolved.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch) {
    return eqMatch[1].trim() === eqMatch[2].trim();
  }

  // Check for inequality: `resolved_value != expected`
  const neqMatch = resolved.match(/^(.+?)\s*!=\s*(.+)$/);
  if (neqMatch) {
    return neqMatch[1].trim() !== neqMatch[2].trim();
  }

  // Truthiness check: non-empty string is truthy
  return resolved.trim().length > 0;
}
