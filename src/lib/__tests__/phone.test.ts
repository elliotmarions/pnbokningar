import { describe, it, expect } from 'vitest'
import { formatSwedishPhone } from '../phone'

describe('formatSwedishPhone', () => {
  it('groups a 10-digit national number 3-3-2-2', () => {
    expect(formatSwedishPhone('0702019295')).toBe('070 201 92 95')
  })
  it('adds the missing leading zero on a 9-digit number', () => {
    expect(formatSwedishPhone('761667375')).toBe('076 166 73 75')
  })
  it('strips the +46 international prefix', () => {
    expect(formatSwedishPhone('+46725316504')).toBe('072 531 65 04')
  })
  it('strips the 0046 international prefix', () => {
    expect(formatSwedishPhone('0046725316504')).toBe('072 531 65 04')
  })
  it('is idempotent on an already-formatted number', () => {
    expect(formatSwedishPhone('070 966 98 55')).toBe('070 966 98 55')
  })
  it('returns empty input untouched', () => {
    expect(formatSwedishPhone('')).toBe('')
  })
})
