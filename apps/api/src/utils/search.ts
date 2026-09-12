const DIACRITIC_EQUIVALENTS: Readonly<Record<string, string>> = {
  a: 'aàáâãäåāăą',
  c: 'cçćĉċč',
  e: 'eèéêëēĕėęě',
  i: 'iìíîïĩīĭįı',
  n: 'nñńņňǹ',
  o: 'oòóôõöøōŏő',
  u: 'uùúûüũūŭůűų',
  y: 'yýÿŷ',
};

function escapeRegexCharacter(value: string): string {
  return /[.*+?^${}()|[\]\\]/.test(value) ? `\\${value}` : value;
}

/**
 * Builds a literal, case-insensitive regular expression that treats common
 * Spanish/Latin diacritics as their unaccented character. The input remains
 * escaped, so user-entered regular-expression syntax is never interpreted.
 */
export function diacriticInsensitiveRegex(value: string): RegExp {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const source = Array.from(normalized, (character) => {
    const equivalents = DIACRITIC_EQUIVALENTS[character.toLocaleLowerCase('es-AR')];
    return equivalents ? `[${equivalents}]` : escapeRegexCharacter(character);
  }).join('');

  return new RegExp(source, 'i');
}
