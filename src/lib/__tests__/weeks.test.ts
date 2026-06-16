import { describe, it, expect } from 'vitest'
import {
  weekInfoFromNumbers,
  shiftHours,
  permanentStaffDefault,
  resolvePermanentStaff,
  shouldAutoOpen,
  formatSwedishDate,
} from '../weeks'

describe('shiftHours', () => {
  it('Saturday (dayIndex 5) is the long daytime shift', () => {
    expect(shiftHours(5)).toEqual({ start: '09:45', end: '18:00', durationH: 8.25 })
  })
  it('weekdays are the 16:00–22:00 evening shift', () => {
    expect(shiftHours(2)).toEqual({ start: '16:00', end: '22:00', durationH: 6 })
  })
})

describe('permanentStaffDefault', () => {
  it('returns the per-weekday baseline', () => {
    expect(permanentStaffDefault(0)).toBe(12) // Monday
    expect(permanentStaffDefault(1)).toBe(32) // Tuesday
    expect(permanentStaffDefault(5)).toBe(26) // Saturday
  })
  it('falls back to 0 for out-of-range indices', () => {
    expect(permanentStaffDefault(9)).toBe(0)
  })
})

describe('resolvePermanentStaff', () => {
  it('an explicit override always wins', () => {
    expect(resolvePermanentStaff(10, 0, false)).toBe(10)
    expect(resolvePermanentStaff(5, 1, true)).toBe(5) // even on a holiday
  })
  it('falls back to the weekday default when no override', () => {
    expect(resolvePermanentStaff(null, 1, false)).toBe(32)
  })
  it('collapses to 0 on a holiday with no override', () => {
    expect(resolvePermanentStaff(null, 1, true)).toBe(0)
  })
})

describe('shouldAutoOpen', () => {
  it('opens on Wednesday within the 18:00–22:59 window', () => {
    expect(shouldAutoOpen('Wednesday', 18, false)).toBe(true)
    expect(shouldAutoOpen('Wednesday', 22, false)).toBe(true) // upper boundary
  })
  it('does not open before 18:00 or after 22:59', () => {
    expect(shouldAutoOpen('Wednesday', 17, false)).toBe(false)
    expect(shouldAutoOpen('Wednesday', 23, false)).toBe(false)
  })
  it('does not open on other weekdays', () => {
    expect(shouldAutoOpen('Tuesday', 18, false)).toBe(false)
  })
  it('force bypasses the time-gate entirely', () => {
    expect(shouldAutoOpen('Tuesday', 3, true)).toBe(true)
  })
})

describe('weekInfoFromNumbers', () => {
  it('round-trips back to the same ISO week number', () => {
    const info = weekInfoFromNumbers(2026, 25)
    expect(info.weekNumber).toBe(25)
    expect(info.weekYear).toBe(2026)
  })
  it('builds Monday–Saturday with the right labels and hours', () => {
    const info = weekInfoFromNumbers(2026, 25)
    expect(info.days).toHaveLength(6)
    expect(info.days[0].label).toBe('Måndag')
    expect(info.days[5].label).toBe('Lördag')
    expect(info.days[5].startTime).toBe('09:45')
    expect(info.days[0].startTime).toBe('16:00')
  })
})

describe('formatSwedishDate', () => {
  it('formats as "<day> <abbrev month>"', () => {
    expect(formatSwedishDate('2026-06-17')).toBe('17 jun')
    expect(formatSwedishDate('2026-01-01')).toBe('1 jan')
  })
})
