import { describe, it, expect } from 'vitest'
import { INACTIVE_DAYS, daysSince, fmtLastSeen, isInactive, msSince } from '../last-seen'

// Fixed "now" so the relative formatting is deterministic. Stockholm local
// time, matching what the API sends.
const NOW = new Date('2026-09-09T12:00:00').getTime()
const ago = (ms: number) => {
  const d = new Date(NOW - ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  // Same shape Postgres emits: "YYYY-MM-DD HH:MM:SS", no zone marker.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const HOUR = 3_600_000
const DAY = 86_400_000

describe('msSince', () => {
  it('returns null for missing or unparseable timestamps', () => {
    expect(msSince(null)).toBeNull()
    expect(msSince(undefined)).toBeNull()
    expect(msSince('')).toBeNull()
    expect(msSince('inte ett datum')).toBeNull()
  })

  it('parses the space-separated shape Postgres sends', () => {
    expect(msSince(ago(2 * HOUR), NOW)).toBe(2 * HOUR)
  })
})

describe('fmtLastSeen', () => {
  it('shows a dash when nothing is known', () => {
    expect(fmtLastSeen(null, NOW)).toBe('—')
  })

  it('collapses the last hour to "Nyss"', () => {
    expect(fmtLastSeen(ago(0), NOW)).toBe('Nyss')
    expect(fmtLastSeen(ago(59 * 60_000), NOW)).toBe('Nyss')
  })

  it('treats a future stamp from clock skew as "Nyss"', () => {
    expect(fmtLastSeen(ago(-5 * 60_000), NOW)).toBe('Nyss')
  })

  it('counts hours within the first day', () => {
    expect(fmtLastSeen(ago(HOUR), NOW)).toBe('1 tim sedan')
    expect(fmtLastSeen(ago(5 * HOUR), NOW)).toBe('5 tim sedan')
    // 23:59 ago is still the same bucket, not "Igår"
    expect(fmtLastSeen(ago(DAY - 60_000), NOW)).toBe('23 tim sedan')
  })

  it('counts days, months and years past that', () => {
    expect(fmtLastSeen(ago(DAY), NOW)).toBe('Igår')
    expect(fmtLastSeen(ago(5 * DAY), NOW)).toBe('5 dagar sedan')
    expect(fmtLastSeen(ago(29 * DAY), NOW)).toBe('29 dagar sedan')
    expect(fmtLastSeen(ago(30 * DAY), NOW)).toBe('1 mån sedan')
    expect(fmtLastSeen(ago(90 * DAY), NOW)).toBe('3 mån sedan')
    expect(fmtLastSeen(ago(400 * DAY), NOW)).toBe('1 år sedan')
    expect(fmtLastSeen(ago(800 * DAY), NOW)).toBe('2 år sedan')
  })
})

describe('isInactive', () => {
  it('flags only accounts silent for at least the threshold', () => {
    expect(isInactive(ago((INACTIVE_DAYS - 1) * DAY), NOW)).toBe(false)
    expect(isInactive(ago(INACTIVE_DAYS * DAY), NOW)).toBe(true)
  })

  it('never flags an account we know nothing about', () => {
    expect(isInactive(null, NOW)).toBe(false)
    expect(daysSince(null, NOW)).toBeNull()
  })
})
