import { describe, it, expect } from 'vitest'
import { isHolidayOrEve, getHolidayInfo } from '../holidays'

describe('isHolidayOrEve', () => {
  it('recognizes fixed public holidays', () => {
    expect(isHolidayOrEve('2026-01-01')).toBe(true) // Nyårsdagen
    expect(isHolidayOrEve('2026-05-01')).toBe(true) // Första maj
    expect(isHolidayOrEve('2026-12-25')).toBe(true) // Juldagen
  })
  it('recognizes eves', () => {
    expect(isHolidayOrEve('2026-12-24')).toBe(true) // Julafton
    expect(isHolidayOrEve('2026-04-30')).toBe(true) // Valborg
  })
  it('returns false for an ordinary working day', () => {
    expect(isHolidayOrEve('2026-06-16')).toBe(false)
    expect(isHolidayOrEve('2026-03-10')).toBe(false)
  })
})

describe('getHolidayInfo', () => {
  it('returns name and type for a holiday', () => {
    expect(getHolidayInfo('2026-01-01')).toEqual({ name: 'Nyårsdagen', type: 'holiday' })
  })
  it('tags eves with type "eve"', () => {
    expect(getHolidayInfo('2026-12-24')).toEqual({ name: 'Julafton', type: 'eve' })
  })
  it('returns null for a normal day', () => {
    expect(getHolidayInfo('2026-06-16')).toBeNull()
  })
})
