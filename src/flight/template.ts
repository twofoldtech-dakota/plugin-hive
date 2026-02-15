/**
 * Resolve nectar template variables in a flight input string.
 *
 * Supports:
 *   {{key}}           — simple substitution
 *   {{#key}}…{{/key}} — conditional block (included when key is truthy)
 */
export function resolveNectar(
  template: string,
  nectar: Record<string, string>,
): string {
  let result = template;

  // Simple variable substitution
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => nectar[key] ?? `{{${key}}}`);

  // Conditional blocks
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => (nectar[key] ? content : ""),
  );

  return result;
}
