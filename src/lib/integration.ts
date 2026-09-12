import crypto from 'crypto'

/**
 * Outbound integration webhooks — notify a partner system when a booking is
 * confirmed or cancelled. Server-to-server only.
 *
 * Configuration (env):
 *   INTEGRATION_WEBHOOK_URL     — partner endpoint we POST events to
 *   INTEGRATION_WEBHOOK_SECRET  — shared secret; we sign the body with HMAC-SHA256
 *
 * If the URL isn't configured this is a silent no-op, so the app runs fine
 * before the partner side is ready.
 */

export type BookingEvent = 'booking.confirmed' | 'booking.cancelled'

export interface BookingEventPayload {
  event: BookingEvent
  bookingId: number          // our application id — stable round-trip identifier
  driverName: string
  date: string               // YYYY-MM-DD
  startTime: string
  endTime: string
}

export async function sendBookingEvent(payload: BookingEventPayload): Promise<void> {
  const url = process.env.INTEGRATION_WEBHOOK_URL
  if (!url) return // not configured yet → no-op

  const body = JSON.stringify({ ...payload, sentAt: new Date().toISOString() })

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const secret = process.env.INTEGRATION_WEBHOOK_SECRET
  if (secret) {
    // HMAC-SHA256 over the exact body the partner receives, so they can verify
    // the request genuinely came from us.
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    headers['X-Signature'] = `sha256=${sig}`
  }

  try {
    await fetch(url, { method: 'POST', headers, body })
  } catch (err) {
    console.error('[integration] webhook delivery failed', { event: payload.event, bookingId: payload.bookingId, err })
  }
}

/** Fire-and-forget wrapper — never blocks the API response on webhook delivery. */
export function sendBookingEventAsync(payload: BookingEventPayload): void {
  sendBookingEvent(payload).catch((err) => console.error('[integration] async error', err))
}

/**
 * Inbound API keys for partner → us calls.
 *
 * `INTEGRATION_API_KEY` holds one or more keys, comma-separated. Each key may
 * carry a label so we can tell partners apart in the activity log and revoke
 * one without touching the others:
 *
 *   INTEGRATION_API_KEY=akeri:pnb_live_xxx,lager:pnb_live_yyy
 *
 * A bare key without a label still works (labelled "partner") — the old
 * single-key configuration keeps running untouched.
 *
 * Rotation: add the new key alongside the old one (same label + "-new" or a
 * date suffix), let the partner switch over, then remove the old entry.
 */
export interface PartnerKey {
  label: string
  key: string
}

const KEY_SEPARATOR = ':'

export function parseIntegrationKeys(raw: string | undefined): PartnerKey[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const idx = entry.indexOf(KEY_SEPARATOR)
      // Generated keys are base64url, so a colon can only be a label separator.
      if (idx <= 0) return { label: 'partner', key: entry }
      return { label: entry.slice(0, idx).trim() || 'partner', key: entry.slice(idx + 1).trim() }
    })
    .filter(k => k.key.length > 0)
}

/**
 * Verify the bearer token on an inbound partner request.
 *
 * Returns the matching key's label (for logging) or null if no key matched.
 * Comparison is done over SHA-256 digests so it stays constant-time *and*
 * leaks nothing about the expected key's length.
 */
export function authenticatePartner(authHeader: string | null): string | null {
  const keys = parseIntegrationKeys(process.env.INTEGRATION_API_KEY)
  if (keys.length === 0) return null // not configured → reject all
  if (!authHeader) return null

  const provided = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!provided) return null

  const providedDigest = crypto.createHash('sha256').update(provided).digest()

  let matched: string | null = null
  for (const { label, key } of keys) {
    const expectedDigest = crypto.createHash('sha256').update(key).digest()
    // Compare every configured key so timing doesn't reveal the key count/order.
    if (crypto.timingSafeEqual(providedDigest, expectedDigest) && matched === null) {
      matched = label
    }
  }
  return matched
}
