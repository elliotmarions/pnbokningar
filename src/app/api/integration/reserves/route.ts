import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { authenticatePartner } from '@/lib/integration'
import { shiftHours } from '@/lib/weeks'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Partner → us: list drivers currently on the reserve list, so a planner can
 * see who is available and book them from their own editor.
 *
 *   GET /api/integration/reserves?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Authorization: Bearer <partner-nyckel>   (same key as the other endpoints)
 *
 * A reserve is always tied to one shift, and a shift is one date — there is no
 * general "can fill in" list. Hours follow the weekday (see shiftHours), so
 * startTime/endTime are derived, not stored.
 *
 * Only *active* reserves are returned: not withdrawn, not rejected, and not
 * already approved — i.e. exactly those still bookable.
 *
 * Ordered by date and then by when the driver signed up, which is the fair
 * queue order (`appliedAt` is included so the planner sees it too).
 *
 * Response 200:
 *   [{ reserveId, driverName, date, startTime, endTime, appliedAt }, ...]
 */
export async function GET(req: NextRequest) {
  if (!authenticatePartner(req.headers.get('authorization'))) {
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
  const rows = await sql<{
    id: number; user_name: string; day_index: number; date: string; applied_at: string
  }[]>`
    SELECT a.id, u.name AS user_name, s.day_index, s.date,
           (a.applied_at AT TIME ZONE 'Europe/Stockholm')::text AS applied_at
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.reserve = 1 AND a.withdrawn = 0 AND a.rejected = 0
      AND ap.id IS NULL
      AND s.date >= ${from} AND s.date <= ${to}
    ORDER BY s.date, a.applied_at
  `

  const reserves = rows.map(r => {
    const { start, end } = shiftHours(r.day_index)
    return {
      reserveId: r.id,
      driverName: r.user_name,
      date: r.date,
      startTime: start,
      endTime: end,
      appliedAt: r.applied_at,
    }
  })

  return NextResponse.json(reserves)
}
