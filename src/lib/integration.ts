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
 * Verify the inbound API key for partner → us calls (booking cancellation).
 * Constant-time compare to avoid timing leaks.
 */
export function verifyIntegrationKey(authHeader: string | null): boolean {
  const expected = process.env.INTEGRATION_API_KEY
  if (!expected) return false // not configured → reject all
  if (!authHeader) return false
  const provided = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (provided.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  } catch {
    return false
  }
}
