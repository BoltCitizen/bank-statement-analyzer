/**
 * Enforced spelling for names people refer to (categories): words joined by
 * hyphens, each word starting upper case, the rest lower case.
 * "kh_salat" → "Kh-Salat", "ÖPNV abo" → "Öpnv-Abo".
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFC')
    .split(/[\s_\-–—/]+/u)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase('de-DE') + w.slice(1).toLocaleLowerCase('de-DE'))
    .join('-');
}

/** Key for comparing names, ignoring case. */
export function nameKey(input: string): string {
  return normalizeName(input).toLocaleLowerCase('de-DE');
}

/** Takes the spelling of an existing equal name if there is one. */
export function canonicalName(input: string, existing: Iterable<string>): string {
  const key = nameKey(input);
  for (const name of existing) {
    if (nameKey(name) === key) return name;
  }
  return normalizeName(input);
}
