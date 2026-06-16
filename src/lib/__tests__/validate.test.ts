import { describe, it, expect } from 'vitest'
import { str, int, bool, oneOf } from '../validate'

describe('str', () => {
  it('trims and returns valid strings', () => {
    expect(str('  hej  ')).toBe('hej')
  })
  it('rejects non-strings and empty/too-long values', () => {
    expect(str(5)).toBeNull()
    expect(str('')).toBeNull()
    expect(str('x'.repeat(501))).toBeNull()
  })
  it('respects custom min/max', () => {
    expect(str('abc', { min: 5 })).toBeNull()
    expect(str('abcde', { min: 5 })).toBe('abcde')
  })
})

describe('int', () => {
  it('accepts integers in range', () => {
    expect(int(5)).toBe(5)
    expect(int(0)).toBe(0)
  })
  it('rejects non-integers, negatives (default min 0) and strings', () => {
    expect(int(5.5)).toBeNull()
    expect(int(-1)).toBeNull()
    expect(int('5')).toBeNull()
  })
  it('respects custom bounds', () => {
    expect(int(-1, { min: -10 })).toBe(-1)
    expect(int(2_000_000_000)).toBeNull() // above default max
  })
})

describe('bool', () => {
  it('accepts only real booleans', () => {
    expect(bool(true)).toBe(true)
    expect(bool(false)).toBe(false)
    expect(bool('true')).toBeNull()
  })
})

describe('oneOf', () => {
  it('returns the value when allowed', () => {
    expect(oneOf('a', ['a', 'b'] as const)).toBe('a')
  })
  it('returns null when not allowed or not a string', () => {
    expect(oneOf('c', ['a', 'b'] as const)).toBeNull()
    expect(oneOf(5, ['a'] as const)).toBeNull()
  })
})
