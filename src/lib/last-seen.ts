/**
 * Helpers for the "Senast aktiv" column in the drivers list.
 *
 * The server sends Stockholm local time with no zone marker (the convention
 * used for every other timestamp in this app), so a Swedish browser parses it
 * back to the right instant.
 */

// Days of silence after which an account is flagged as likely departed.
// A driver who leaves PostNord loses their Azure account, so they can never
// sign in again — a long silence is the closest thing we have to a "has quit"
// signal without querying Azure directly.
export const INACTIVE_DAYS = 90

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Milliseconds since the given timestamp, or null if absent/unparseable. */
export function msSince(ts: string | null | undefined, now = Date.now()): number | null {
  if (!ts) return null
  const t = new Date(ts.replace(' ', 'T')).getTime()
  if (isNaN(t)) return null
  return now - t
}

/** Whole days since the given timestamp, or null if absent/unparseable. */
export function daysSince(ts: string | null | undefined, now = Date.now()): number | null {
  const ms = msSince(ts, now)
  return ms === null ? null : Math.floor(ms / DAY_MS)
}

/** True once an account has been silent long enough to look abandoned. */
export function isInactive(ts: string | null | undefined, now = Date.now()): boolean {
  const days = daysSince(ts, now)
  return days !== null && days >= INACTIVE_DAYS
}

/**
 * Relative time for display. Deliberately coarse past the first day — the
 * column answers "is this account still alive?", not "when exactly?".
 */
export function fmtLastSeen(ts: string | null | undefined, now = Date.now()): string {
  const ms = msSince(ts, now)
  if (ms === null) return '—'
  // Clock skew between the DB and the browser can put a fresh stamp slightly
  // in the future; treat that as "just now" rather than showing a negative age.
  if (ms < HOUR_MS) return 'Nyss'
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS)
    return hours === 1 ? '1 tim sedan' : `${hours} tim sedan`
  }
  const days = Math.floor(ms / DAY_MS)
  if (days === 1) return 'Igår'
  if (days < 30) return `${days} dagar sedan`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? '1 mån sedan' : `${months} mån sedan`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? '1 år sedan' : `${years} år sedan`
}
