// Lightweight input validation helpers — used in API routes to enforce
// types, lengths, and formats before touching the database.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_RE = /^\+?[\d\s\-()+]{7,20}$/

/** Returns the trimmed string if it passes, null otherwise. */
export function str(
  v: unknown,
  { min = 1, max = 500 }: { min?: number; max?: number } = {},
): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.length < min || t.length > max) return null
  return t
}

/** Returns the integer if it's in range, null otherwise. */
export function int(
  v: unknown,
  { min = 0, max = 1_000_000_000 }: { min?: number; max?: number } = {},
): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  if (v < min || v > max) return null
  return v
}

/** Returns the boolean if it's actually a boolean, null otherwise. */
export function bool(v: unknown): boolean | null {
  if (typeof v !== 'boolean') return null
  return v
}

/** Returns the value if it's one of the allowed literals, null otherwise. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  if (typeof v !== 'string') return null
  if (!(allowed as readonly string[]).includes(v)) return null
  return v as T
}

/** Returns a 400 error payload for a missing/invalid field. */
export function fieldError(field: string): { error: string } {
  return { error: `Ogiltigt värde för fältet: ${field}` }
}
