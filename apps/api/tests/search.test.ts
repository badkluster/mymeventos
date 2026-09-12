import { describe, expect, it } from 'vitest';
import { diacriticInsensitiveRegex } from '../src/utils/search';

describe('diacritic-insensitive search', () => {
  it.each([
    ['yesica', 'Yésica'],
    ['YESICA', 'Yésica'],
    ['Yésica', 'Yesica'],
    ['munoz', 'Muñoz'],
    ['lucia nunez', 'Lucía Núñez'],
  ])('matches %s against %s', (query, storedValue) => {
    expect(diacriticInsensitiveRegex(query).test(storedValue)).toBe(true);
  });

  it('treats regular-expression characters as literal text', () => {
    const expression = diacriticInsensitiveRegex('Ana (15) [VIP]');

    expect(expression.test('Ana (15) [VIP]')).toBe(true);
    expect(expression.test('Ana 15 V')).toBe(false);
  });
});
