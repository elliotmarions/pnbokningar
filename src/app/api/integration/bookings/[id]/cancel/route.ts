import { NextRequest, NextResponse } from 'next/server'
import { approvalRepo, applicationRepo, getDb, logActivityAsync } from '@/lib/db'
import { authenticatePartner } from '@/lib/integration'
import { sendPushToUserAsync } from '@/lib/push'
import { dayLabelFull, formatSwedishDate } from '@/lib/weeks'

/**
 * Partner → us: cancel a confirmed booking. Protected by a partner API key
 * (Bearer token, server-to-server only). Performs the same withdrawal as the
 * admin "Avboka" action, and notifies the driver via push. The key's label is
 * recorded in the activity log so we can see which partner cancelled.
 *
 * Deliberately does NOT emit a booking.cancelled webhook back to the partner —
 * the partner initiated this, so echoing would be redundant and risk a loop.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const partner = authenticatePartner(req.headers.get('authorization'))
  if (!partner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appId = parseInt((await params).id)
  if (!Number.isInteger(appId) || appId < 1) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  let reason: string | undefined
  try {
    const body = await req.json()
    reason = typeof body?.reason === 'string' ? body.reason.trim() || undefined : undefined
  } catch { /* body optional */ }

  const sql = getDb()
  const [info] = await sql<{
    user_id: string; day_index: number; date: string; user_name: string
    was_approved: number; booked_from_reserve: number
  }[]>`
    SELECT a.user_id, s.day_index, s.date, u.name AS user_name, a.booked_from_reserve,
           CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS was_approved
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.id = ${appId}
  `

  if (!info) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  await approvalRepo.unapprove(appId)

  // A booking the partner made off our reserve list goes back to being a
  // reserve: the driver said they were available that day, and cancelling the
  // booking doesn't retract that. Anything else is withdrawn as before.
  const backToReserve = info.booked_from_reserve === 1
  if (backToReserve) {
    await sql`
      UPDATE applications
      SET reserve = 1, booked_from_reserve = 0, withdrawn = 0, withdrawal_reason = NULL
      WHERE id = ${appId}
    `
  } else {
    // withdrawn_by left undefined — the cancellation came from the partner system, not an admin.
    await applicationRepo.markWithdrawn(appId, reason ?? 'Avbokad via integration', undefined)
  }

  // Tell the driver their shift was cancelled (same as an admin cancel), and
  // say so if they're still queued — otherwise it reads as "you're out".
  sendPushToUserAsync(info.user_id, {
    title: 'Pass avbokat',
    body: backToReserve
      ? `Ditt pass ${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)} har avbokats. Du står kvar som reserv.`
      : `Ditt godkända pass ${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)} har avbokats.`,
    url: '/',
    tag: `withdraw-${appId}`,
  })

  logActivityAsync({
    action: 'cancelled',
    actorName: `Partnersystem (${partner})`,
    driverName: info.user_name,
    shiftDate: info.date,
    dayIndex: info.day_index,
    detail: (reason ?? 'Avbokad via integration') + (backToReserve ? ' — tillbaka till reservlistan' : ''),
  })

  return NextResponse.json({ ok: true, bookingId: appId })
}
