import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { describeTarget, sendBookingEvent } from '@/lib/integration'
import { shiftHours } from '@/lib/weeks'

/**
 * One-time backfill: re-emit a booking.confirmed webhook for every currently
 * confirmed (approved, not withdrawn/rejected) booking from today onward, so a
 * freshly-connected partner system gets all existing bookings.
 *
 * Trigger by opening this URL in the browser while logged in as an admin:
 *   /api/integration/sync-all
 *
 * Safe to run repeatedly — it only re-sends existing data (the partner side
 * should upsert by bookingId).
 *
 * The response reports what the partner actually answered. It used to count
 * attempts, which made a run where every event was rejected with 401 look
 * identical to a fully successful one.
 */
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = process.env.INTEGRATION_WEBHOOK_URL
  if (!url) {
    return NextResponse.json(
      { error: 'INTEGRATION_WEBHOOK_URL är inte satt — sätt partnerns webhook-URL i Vercel först.' },
      { status: 503 },
    )
  }

  const sql = getDb()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const rows = await sql<{ id: number; user_name: string; day_index: number; date: string }[]>`
    SELECT a.id, u.name AS user_name, s.day_index, s.date
    FROM approvals ap
    JOIN applications a ON a.id = ap.application_id
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE a.withdrawn = 0 AND a.rejected = 0
      AND s.date >= ${todayStr}
    ORDER BY s.date, u.name
  `

  // Send sequentially-ish but in parallel batches so we don't hammer the
  // partner with hundreds of simultaneous requests.
  const results = await Promise.all(
    rows.map(r => {
      const { start, end } = shiftHours(r.day_index)
      return sendBookingEvent({
        event: 'booking.confirmed',
        bookingId: r.id,
        driverName: r.user_name,
        date: r.date,
        startTime: start,
        endTime: end,
      })
    })
  )

  const accepted = results.filter(r => r.delivered).length

  // Group the rejections by status so one glance says whether it's a signature
  // problem (401), a payload problem (400) or the partner being down (5xx).
  const rejectedByStatus: Record<string, number> = {}
  let transportErrors = 0
  let firstError: string | undefined
  for (const r of results) {
    if (r.delivered) continue
    if (r.status) {
      const key = String(r.status)
      rejectedByStatus[key] = (rejectedByStatus[key] ?? 0) + 1
    } else {
      transportErrors++
    }
    if (!firstError && r.error) firstError = r.error
  }

  const failed = results.length - accepted
  const signed = Boolean(process.env.INTEGRATION_WEBHOOK_SECRET)

  return NextResponse.json({
    ok: failed === 0,
    total: rows.length,
    accepted,
    failed,
    rejectedByStatus,
    transportErrors,
    firstError,
    target: describeTarget(url),
    signed,
    note: failed === 0
      ? `Partnersystemet kvitterade alla ${accepted} bekräftade bokningar från och med idag.`
      : `${failed} av ${rows.length} avvisades — se rejectedByStatus och firstError. `
        + (signed ? '' : 'INTEGRATION_WEBHOOK_SECRET är inte satt, så anropen skickades osignerade. '),
  })
}
