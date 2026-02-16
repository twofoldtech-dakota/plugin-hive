/**
 * Resolve nectar template variables in a flight input string.
 *
 * Supports:
 *   {{key}}              — simple substitution
 *   {{key|filter}}       — substitution with filter
 *   {{key|default:val}}  — fallback if key is missing/empty
 *   {{key|json}}         — JSON-encode the value
 *   {{key|upper}}        — uppercase
 *   {{key|lower}}        — lowercase
 *   {{#key}}…{{/key}}    — conditional block (included when key is truthy)
 */
export function resolveNectar(
  template: string,
  nectar: Record<string, string>,
): string {
  let result = template;

  // Variable substitution with optional filter: {{key}} or {{key|filter}} or {{key|filter:arg}}
  result = result.replace(/\{\{(\w+)(?:\|([^}]+))?\}\}/g, (match, key, filterExpr) => {
    const value = nectar[key];

    if (filterExpr) {
      return applyFilter(value, filterExpr, key);
    }

    // No filter: return value or leave placeholder
    return value ?? match;
  });

  // Conditional blocks
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => (nectar[key] ? content : ""),
  );

  return result;
}

/**
 * Apply a filter to a nectar value.
 */
function applyFilter(value: string | undefined, filterExpr: string, key: string): string {
  // Parse filter name and optional argument: "default:fallback" → name="default", arg="fallback"
  const colonIdx = filterExpr.indexOf(":");
  const filterName = colonIdx >= 0 ? filterExpr.slice(0, colonIdx) : filterExpr;
  const filterArg = colonIdx >= 0 ? filterExpr.slice(colonIdx + 1) : undefined;

  switch (filterName) {
    case "default":
      return (value !== undefined && value !== "") ? value : (filterArg ?? "");

    case "json":
      return JSON.stringify(value ?? "");

    case "upper":
      return (value ?? "").toUpperCase();

    case "lower":
      return (value ?? "").toLowerCase();

    default:
      // Unknown filter — return value as-is or placeholder
      return value ?? `{{${key}|${filterExpr}}}`;
  }
}
