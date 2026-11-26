import { describe, expect, it } from 'vitest';
import { canonicalName, nameKey, normalizeName } from '../../src/lib/names';

describe('normalizeName', () => {
  it.each([
    ['lebensmittel', 'Lebensmittel'],
    ['ÖPNV abo', 'Öpnv-Abo'],
    ['kh_salat', 'Kh-Salat'],
    ['  auto -  versicherung ', 'Auto-Versicherung'],
    ['straße', 'Straße'],
  ])('%s → %s', (input, out) => expect(normalizeName(input)).toBe(out));

  it('compares ignoring case', () => expect(nameKey('ÖPNV-ABO')).toBe(nameKey('öpnv abo')));

  it('takes the spelling of an existing name', () =>
    expect(canonicalName('öpnv abo', ['Lebensmittel', 'Öpnv-Abo'])).toBe('Öpnv-Abo'));
});
