import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { describeTarget, parseIntegrationKeys, secretFingerprint } from '@/lib/integration'

/**
 * Admin-only configuration check for the partner integration.
 *
 * Answers the three questions you cannot otherwise ask a running deployment:
 * which webhook URL is actually configured (a stale preview address is the
 * classic one), whether the signing secret is set at all, and whether it is the
 * same string the partner holds.
 *
 * No secret is returned. `fingerprint` is the first 12 hex chars of the
 * secret's SHA-256 — the partner can compute the same value from their copy and
 * compare. Equal fingerprints mean equal secrets; nothing about the secret
 * itself is recoverable from them.
 *
 *   Partner, to compute theirs:
 *     node -e "console.log(require('crypto').createHash('sha256').update(process.env.INTEGRATION_HMAC_SECRET).digest('hex').slice(0,12))"
 */
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const webhookUrl = process.env.INTEGRATION_WEBHOOK_URL
  const webhookSecret = process.env.INTEGRATION_WEBHOOK_SECRET
  const inboundKeys = parseIntegrationKeys(process.env.INTEGRATION_API_KEY)

  return NextResponse.json({
    outbound: {
      configured: Boolean(webhookUrl),
      target: describeTarget(webhookUrl),
      secretSet: Boolean(webhookSecret),
      secretLength: webhookSecret?.length ?? 0,
      secretFingerprint: secretFingerprint(webhookSecret),
    },
    inbound: {
      keyCount: inboundKeys.length,
      // Labels are ours, not secret. Fingerprints let a partner confirm they
      // hold the right key without either side pasting it anywhere.
      keys: inboundKeys.map(k => ({
        label: k.label,
        length: k.key.length,
        fingerprint: secretFingerprint(k.key),
      })),
    },
    deployment: {
      // Vercel injects these at build time — proof of which commit is serving.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? '<okänd>',
      environment: process.env.VERCEL_ENV ?? '<lokal>',
    },
  })
}
