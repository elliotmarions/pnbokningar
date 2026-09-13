import { describe, it, expect, afterEach } from 'vitest'
import { parseIntegrationKeys, authenticatePartner, describeTarget, secretFingerprint } from '../integration'

const ORIGINAL = process.env.INTEGRATION_API_KEY

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INTEGRATION_API_KEY
  else process.env.INTEGRATION_API_KEY = ORIGINAL
})

describe('parseIntegrationKeys', () => {
  it('returns nothing when unset or empty', () => {
    expect(parseIntegrationKeys(undefined)).toEqual([])
    expect(parseIntegrationKeys('')).toEqual([])
    expect(parseIntegrationKeys('  ,  ')).toEqual([])
  })
  it('treats a bare key as the default "partner" label', () => {
    expect(parseIntegrationKeys('abc123')).toEqual([{ label: 'partner', key: 'abc123' }])
  })
  it('splits labelled keys on the first colon', () => {
    expect(parseIntegrationKeys('akeri:pnb_abc')).toEqual([{ label: 'akeri', key: 'pnb_abc' }])
  })
  it('parses several comma-separated keys and trims whitespace', () => {
    expect(parseIntegrationKeys(' akeri:one , lager:two ')).toEqual([
      { label: 'akeri', key: 'one' },
      { label: 'lager', key: 'two' },
    ])
  })
  it('skips entries with an empty key', () => {
    expect(parseIntegrationKeys('akeri:,lager:two')).toEqual([{ label: 'lager', key: 'two' }])
  })
})

describe('authenticatePartner', () => {
  it('rejects everything when no key is configured', () => {
    delete process.env.INTEGRATION_API_KEY
    expect(authenticatePartner('Bearer whatever')).toBeNull()
  })
  it('rejects a missing or empty header', () => {
    process.env.INTEGRATION_API_KEY = 'akeri:secret'
    expect(authenticatePartner(null)).toBeNull()
    expect(authenticatePartner('Bearer ')).toBeNull()
  })
  it('accepts a valid key and returns its label', () => {
    process.env.INTEGRATION_API_KEY = 'akeri:secret'
    expect(authenticatePartner('Bearer secret')).toBe('akeri')
    expect(authenticatePartner('secret')).toBe('akeri') // bare token also allowed
  })
  it('identifies which of several partners is calling', () => {
    process.env.INTEGRATION_API_KEY = 'akeri:one,lager:two'
    expect(authenticatePartner('Bearer one')).toBe('akeri')
    expect(authenticatePartner('Bearer two')).toBe('lager')
    expect(authenticatePartner('Bearer three')).toBeNull()
  })
  it('rejects a wrong key of a different length (no crash, no match)', () => {
    process.env.INTEGRATION_API_KEY = 'akeri:secret'
    expect(authenticatePartner('Bearer s')).toBeNull()
    expect(authenticatePartner('Bearer secretsecretsecret')).toBeNull()
  })
  it('still supports the old single unlabelled key', () => {
    process.env.INTEGRATION_API_KEY = 'legacy-key'
    expect(authenticatePartner('Bearer legacy-key')).toBe('partner')
  })
})

describe('describeTarget', () => {
  it('reduces a URL to host + path for logging', () => {
    expect(describeTarget('https://veddestask-pbildashboard.pages.dev/api/integration/bookings'))
      .toBe('veddestask-pbildashboard.pages.dev/api/integration/bookings')
  })
  it('strips query strings but keeps the path', () => {
    expect(describeTarget('https://example.com/hook?token=abc')).toBe('example.com/hook')
  })
  it('flags unset and malformed URLs instead of throwing', () => {
    expect(describeTarget(undefined)).toBe('<ej konfigurerad>')
    expect(describeTarget('inte-en-url')).toBe('<ogiltig URL>')
  })
})

describe('secretFingerprint', () => {
  it('is null when no secret is set', () => {
    expect(secretFingerprint(undefined)).toBeNull()
    expect(secretFingerprint('')).toBeNull()
  })
  it('is stable for the same secret, so both sides can compare', () => {
    expect(secretFingerprint('delad-hemlighet')).toBe(secretFingerprint('delad-hemlighet'))
  })
  it('differs for different secrets', () => {
    expect(secretFingerprint('hemlighet-a')).not.toBe(secretFingerprint('hemlighet-b'))
  })
  it('is short and reveals nothing of the secret', () => {
    const fp = secretFingerprint('en-ganska-lang-delad-hemlighet-som-aldrig-far-lacka')!
    expect(fp).toHaveLength(12)
    expect(fp).toMatch(/^[0-9a-f]{12}$/)
    expect('en-ganska-lang-delad-hemlighet-som-aldrig-far-lacka').not.toContain(fp)
  })
})
