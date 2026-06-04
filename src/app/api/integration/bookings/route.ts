import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { verifyIntegrationKey } from '@/lib/integration'
import { shiftHours } from '@/lib/weeks'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Partner → us: read all confirmed bookings in a date range, so the partner can
 * reconcile their copy against our source of truth (the safety net behind the
 * realtime booking.confirmed / booking.cancelled webhooks).
 *
 *   GET /api/integration/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Authorization: Bearer <INTEGRATION_API_KEY>   (same key as the cancel endpoint)
 *
 * Returns every confirmed (approved, not withdrawn, not rejected) shift in the
 * range — i.e. exactly what should currently exist on the partner side. Fields
 * match the booking.confirmed webhook. from/to are inclusive (YYYY-MM-DD).
 *
 * Response 200:
 *   [{ bookingId, driverName, date, startTime, endTime }, ...]
 */
export async function GET(req: NextRequest) {
  if (!verifyIntegrationKey(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: 'from och to krävs i formatet YYYY-MM-DD' },
      { status: 400 },
    )
  }

  // Dates are stored as 'YYYY-MM-DD' text, so lexical comparison is chronological.
  const sql = getDb()
  const rows = await sql<{ id: number; user_name: string; day_index: number; date: string }[]>`
    SELECT a.id, u.name AS user_name, s.day_index, s.date
    FROM approvals ap
    JOIN applications a ON a.id = ap.application_id
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE a.withdrawn = 0 AND a.rejected = 0
      AND s.date >= ${from} AND s.date <= ${to}
    ORDER BY s.date, u.name
  `

  const bookings = rows.map(r => {
    const { start, end } = shiftHours(r.day_index)
    return {
      bookingId: r.id,
      driverName: r.user_name,
      date: r.date,
      startTime: start,
      endTime: end,
    }
  })

  return NextResponse.json(bookings)
}
