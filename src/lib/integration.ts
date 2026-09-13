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
 * before the partner side is ready. Everything else is logged: a delivery that
 * the partner rejects must never disappear without a trace.
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

/** Outcome of one delivery attempt — so callers can report real numbers. */
export interface DeliveryResult {
  delivered: boolean
  /** HTTP status the partner answered with, when we got that far. */
  status?: number
  /** Why it failed: the partner's response body, or a transport error. */
  error?: string
  /** 'not-configured' when INTEGRATION_WEBHOOK_URL is unset (a deliberate no-op). */
  skipped?: boolean
}

const TIMEOUT_MS = 10_000
/** Partner error bodies can be whole HTML pages — keep the log readable. */
const MAX_LOGGED_BODY = 500

/**
 * Host + path of the configured webhook target, for logs. Never secret, and the
 * quickest way to spot that a stale preview URL is still configured.
 */
export function describeTarget(rawUrl: string | undefined): string {
  if (!rawUrl) return '<ej konfigurerad>'
  try {
    const u = new URL(rawUrl)
    return u.host + u.pathname
  } catch {
    return '<ogiltig URL>'
  }
}

/**
 * Short, non-reversible fingerprint of a shared secret. Both sides can compute
 * it and compare over any channel to confirm they hold the same string —
 * without either side ever sending the secret itself.
 */
export function secretFingerprint(secret: string | undefined | null): string | null {
  if (!secret) return null
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12)
}

export async function sendBookingEvent(payload: BookingEventPayload): Promise<DeliveryResult> {
  return sendIntegrationEvent(payload.event, { ...payload })
}

/**
 * Post one event to the partner. Shared by booking and reserve events so the
 * signing, timeout and failure logging can only ever behave one way.
 */
async function sendIntegrationEvent(
  eventName: string,
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  const url = process.env.INTEGRATION_WEBHOOK_URL
  if (!url) return { delivered: false, skipped: true } // not configured yet → no-op

  // The partner verifies the HMAC over the raw bytes we send, so the string we
  // sign and the string we send must be the same one — never re-serialised.
  const body = JSON.stringify({ ...payload, sentAt: new Date().toISOString() })

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const secret = process.env.INTEGRATION_WEBHOOK_SECRET
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    headers['X-Signature'] = `sha256=${sig}`
  } else {
    // A partner that requires signatures answers 401 to every single event, and
    // before this log line that looked exactly like "nothing happened".
    console.error('[integration] INTEGRATION_WEBHOOK_SECRET saknas — skickar OSIGNERAT', {
      event: eventName, target: describeTarget(url),
    })
  }

  try {
    const res = await fetch(url, {
      method: 'POST', headers, body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, MAX_LOGGED_BODY)
      console.error('[integration] webhook avvisad av partnern', {
        event: eventName, status: res.status, response: text, target: describeTarget(url),
      })
      return { delivered: false, status: res.status, error: text }
    }

    return { delivered: true, status: res.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[integration] webhook kunde inte levereras', {
      event: eventName, error: message, target: describeTarget(url),
    })
    return { delivered: false, error: message }
  }
}

/** Fire-and-forget wrapper — never blocks the API response on webhook delivery. */
export function sendBookingEventAsync(payload: BookingEventPayload): void {
  sendBookingEvent(payload).catch((err) => console.error('[integration] async error', err))
}

/**
 * Reserve events — the partner's planning view mirrors our reserve list, so it
 * needs to hear about every change rather than waiting for its next poll.
 *
 * `reserve.removed` carries only the id: the partner deletes the row, and the
 * reason (withdrawn, rejected, booked, deleted) is not theirs to act on.
 */
export interface ReserveSnapshot {
  reserveId: number
  driverName: string
  date: string
  startTime: string
  endTime: string
  appliedAt: string          // ISO-8601 UTC
}

export function sendReserveAddedAsync(snapshot: ReserveSnapshot): void {
  sendIntegrationEvent('reserve.added', { event: 'reserve.added', ...snapshot })
    .catch((err) => console.error('[integration] async error', err))
}

export function sendReserveRemovedAsync(reserveId: number): void {
  sendIntegrationEvent('reserve.removed', { event: 'reserve.removed', reserveId })
    .catch((err) => console.error('[integration] async error', err))
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
