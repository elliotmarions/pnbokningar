import { NextRequest, NextResponse } from 'next/server'
import { applicationRepo, getDb, logActivityAsync } from '@/lib/db'
import { authenticatePartner, sendBookingEventAsync } from '@/lib/integration'
import { sendPushToUserAsync } from '@/lib/push'
import { dayLabelFull, formatSwedishDate, shiftHours } from '@/lib/weeks'
import { str } from '@/lib/validate'

/**
 * Partner → us: book a driver off the reserve list, exactly as if an admin had
 * promoted them in the app — the driver gets the usual "Pass godkänt" push, and
 * we emit the usual booking.confirmed webhook back to the partner.
 *
 *   POST /api/integration/reserves/{reserveId}/book
 *   Authorization: Bearer <partner-nyckel>
 *   { "bookedBy": "Namn på planeraren", "bookedByEmail": "..." }
 *
 * NOTE for the partner: promoting keeps the same row, so the returned
 * `bookingId` is the SAME number as `reserveId`. There is no second id.
 *
 * The approval carries no admin (approved_by NULL) — the planner is not a user
 * in our system. Their name goes in the activity log instead, so it is still
 * visible who booked.
 *
 *   200 { bookingId }
 *   404 unknown id
 *   409 exists but is not a bookable reserve (already booked, withdrawn, rejected)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const partner = authenticatePartner(req.headers.get('authorization'))
  if (!partner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reserveId = parseInt((await params).id)
  if (!Number.isInteger(reserveId) || reserveId < 1) {
    return NextResponse.json({ error: 'Invalid reserve id' }, { status: 400 })
  }

  let bookedBy: string | null = null
  let bookedByEmail: string | null = null
  try {
    const body = await req.json()
    bookedBy = str(body?.bookedBy, { max: 200 })
    bookedByEmail = str(body?.bookedByEmail, { max: 200 })
  } catch { /* body optional */ }

  const sql = getDb()
  const [app] = await sql<{
    reserve: number; withdrawn: number; rejected: number; approved: number
  }[]>`
    SELECT a.reserve, a.withdrawn, a.rejected,
           CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS approved
    FROM applications a
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.id = ${reserveId}
  `

  if (!app) {
    return NextResponse.json({ error: 'Reserve not found' }, { status: 404 })
  }
  if (app.approved === 1 || app.reserve === 0) {
    return NextResponse.json(
      { error: 'Reserve already booked', reason: 'already_booked' },
      { status: 409 },
    )
  }
  if (app.withdrawn === 1 || app.rejected === 1) {
    return NextResponse.json(
      { error: 'Reserve is no longer active', reason: app.withdrawn === 1 ? 'withdrawn' : 'rejected' },
      { status: 409 },
    )
  }

  // Same promotion an admin does in the app: reserve = 0 + an approval row.
  const info = await applicationRepo.promote(reserveId, null)
  // Remember where this booking came from, so a later partner cancellation can
  // put the driver back on the reserve list instead of dropping them.
  await sql`UPDATE applications SET booked_from_reserve = 1 WHERE id = ${reserveId}`

  const { start, end } = shiftHours(info.shift_day_index)

  sendPushToUserAsync(info.user_id, {
    title: 'Pass godkänt ✅',
    body: `${dayLabelFull(info.shift_day_index)} ${formatSwedishDate(info.shift_date)}, ${start}–${end}`,
    url: '/',
    tag: `promote-${reserveId}`,
  })

  sendBookingEventAsync({
    event: 'booking.confirmed',
    bookingId: reserveId,
    driverName: info.user_name,
    date: info.shift_date,
    startTime: start,
    endTime: end,
  })

  logActivityAsync({
    action: 'booked',
    actorName: `Partnersystem (${partner})${bookedBy ? ` · ${bookedBy}` : ''}`,
    driverName: info.user_name,
    shiftDate: info.shift_date,
    dayIndex: info.shift_day_index,
    detail: bookedByEmail
      ? `Inbokad från reserv via partnersystem (${bookedByEmail})`
      : 'Inbokad från reserv via partnersystem',
  })

  return NextResponse.json({ bookingId: reserveId })
}
