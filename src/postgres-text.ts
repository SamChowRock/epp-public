// Reject instead of silently replacing lone surrogates or removing NUL.
export function isPostgresText(value: string): boolean {
  return value.isWellFormed() && !value.includes('\u0000');
}
