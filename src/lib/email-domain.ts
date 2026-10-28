/**
 * Who is allowed into the app, decided by e-mail domain.
 *
 * Azure sign-in alone isn't enough: the app registration also accepts personal
 * Microsoft accounts and guests, which is how a driver got in with a Gmail
 * address. Only PostNord addresses get a session; subdomains count too
 * (e.g. test.postnord.se in the seed data).
 *
 * Override with ALLOWED_EMAIL_DOMAINS (comma-separated) if another domain ever
 * needs access.
 */

// postnord.onmicrosoft.com is the tenant's built-in domain: some accounts only have
// that as their address, and Azure sends it as the e-mail claim.
const DEFAULT_DOMAINS = [
  'postnord.com', 'postnord.se', 'postnord.dk', 'postnord.no', 'postnord.fi',
  'postnord.onmicrosoft.com',
]

export function allowedEmailDomains(): string[] {
  const fromEnv = (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
  return fromEnv.length > 0 ? fromEnv : DEFAULT_DOMAINS
}

export function isAllowedEmail(email: string | null | undefined, domains = allowedEmailDomains()): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at < 1) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domains.some(d => domain === d || domain.endsWith(`.${d}`))
}
