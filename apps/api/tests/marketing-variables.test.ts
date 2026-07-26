import { describe, expect, it } from 'vitest';
import { findMarketingVariableNames, renderMarketingVariables } from '../src/modules/marketing/marketing-variables.service';

describe('marketing variable renderer', () => {
  it('replaces known variables with their value', () => {
    const { rendered, missingVariables } = renderMarketingVariables('Hola {{firstName}}, bienvenido a {{companyName}}.', { firstName: 'Ana', companyName: 'M&M Eventos' });
    expect(rendered).toBe('Hola Ana, bienvenido a M&amp;M Eventos.');
    expect(missingVariables).toEqual([]);
  });

  it('falls back to the declared default when a variable is missing', () => {
    const { rendered, missingVariables } = renderMarketingVariables('Hola {{firstName | default: "¿cómo estás?"}}', {});
    expect(rendered).toBe('Hola ¿cómo estás?');
    expect(missingVariables).toEqual([]);
  });

  it('reports missing variables without a fallback and leaves them blank instead of breaking the send', () => {
    const { rendered, missingVariables } = renderMarketingVariables('Código: {{promotionCode}}', {});
    expect(rendered).toBe('Código: ');
    expect(missingVariables).toEqual(['promotionCode']);
  });

  it('escapes HTML-significant characters in recipient-controlled values by default', () => {
    const { rendered } = renderMarketingVariables('Hola {{firstName}}', { firstName: '<script>alert(1)</script>' });
    expect(rendered).not.toContain('<script>');
    expect(rendered).toContain('&lt;script&gt;');
  });

  it('can skip escaping for pre-sanitized HTML templates', () => {
    const { rendered } = renderMarketingVariables('<a href="{{buttonUrl}}">Ir</a>', { buttonUrl: 'https://example.com/a?x=1&y=2' }, { escapeValues: false });
    expect(rendered).toBe('<a href="https://example.com/a?x=1&y=2">Ir</a>');
  });

  it('lists every distinct variable name referenced in a template', () => {
    expect(findMarketingVariableNames('{{firstName}} {{firstName}} {{companyName}}')).toEqual(['firstName', 'companyName']);
  });
});
