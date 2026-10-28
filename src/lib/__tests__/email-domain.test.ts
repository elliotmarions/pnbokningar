import { describe, it, expect } from 'vitest'
import { isAllowedEmail } from '../email-domain'

const domains = ['postnord.com', 'postnord.se']

describe('isAllowedEmail', () => {
  it('accepts a PostNord address', () => {
    expect(isAllowedEmail('elliot.marions@postnord.com', domains)).toBe(true)
  })
  it('ignores case', () => {
    expect(isAllowedEmail('Erik.Lindqvist@PostNord.SE', domains)).toBe(true)
  })
  it('accepts subdomains', () => {
    expect(isAllowedEmail('erik.lindqvist@test.postnord.se', domains)).toBe(true)
  })
  it('rejects Gmail', () => {
    expect(isAllowedEmail('inkcatonline@gmail.com', domains)).toBe(false)
  })
  it('rejects look-alike domains', () => {
    expect(isAllowedEmail('x@notpostnord.com', domains)).toBe(false)
    expect(isAllowedEmail('x@postnord.com.evil.io', domains)).toBe(false)
  })
  it('rejects a PostNord domain in the local part', () => {
    expect(isAllowedEmail('postnord.com@gmail.com', domains)).toBe(false)
  })
  it('rejects missing or malformed addresses', () => {
    expect(isAllowedEmail(null, domains)).toBe(false)
    expect(isAllowedEmail('', domains)).toBe(false)
    expect(isAllowedEmail('postnord.com', domains)).toBe(false)
  })
})
