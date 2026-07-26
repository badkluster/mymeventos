// Variable substitution for campaign/template content. Deliberately not a full
// templating language (no loops/conditionals) — just `{{var}}` and
// `{{var | default: "fallback"}}`, per the module brief (§8).

export type MarketingVariableContext = Record<string, string | number | undefined | null>;

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*default:\s*"([^"]*)")?\s*\}\}/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarketingVariables(
  source: string,
  context: MarketingVariableContext,
  options: { escapeValues?: boolean } = {}
): { rendered: string; missingVariables: string[] } {
  const escapeValues = options.escapeValues ?? true;
  const missing = new Set<string>();
  const rendered = (source ?? '').replace(VARIABLE_PATTERN, (_match, key: string, fallback: string | undefined) => {
    const raw = context[key];
    if (raw !== undefined && raw !== null && String(raw) !== '') {
      const value = String(raw);
      return escapeValues ? escapeHtml(value) : value;
    }
    if (fallback !== undefined) return escapeValues ? escapeHtml(fallback) : fallback;
    missing.add(key);
    return '';
  });
  return { rendered, missingVariables: [...missing] };
}

export function findMarketingVariableNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of (source ?? '').matchAll(VARIABLE_PATTERN)) names.add(match[1]);
  return [...names];
}
