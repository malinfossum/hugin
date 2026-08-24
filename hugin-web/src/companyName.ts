/** Display transform only — the db and extract keep Brreg's raw (ALL-CAPS) names
 * (spec v3.1 item 14). Applied only when the name has no lowercase letters, so
 * NAV's already-mixed-case employer names pass through untouched. */
const LEGAL_FORMS = new Set([
  'AS',
  'ASA',
  'ANS',
  'DA',
  'SA',
  'NUF',
  'KS',
  'IKS',
  'HF',
  'BA',
  'ENK',
  'KF',
  'FKF',
  'SE',
  'FLI',
  'STI',
])

function titleWord(word: string): string {
  if (LEGAL_FORMS.has(word)) return word
  return word
    .split('-')
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toLocaleUpperCase('nb-NO') + part.slice(1).toLocaleLowerCase('nb-NO')
    )
    .join('-')
}

export function displayCompanyName(raw: string): string {
  if (raw !== raw.toLocaleUpperCase('nb-NO')) return raw // has lowercase → already styled
  return raw.split(' ').map(titleWord).join(' ')
}
