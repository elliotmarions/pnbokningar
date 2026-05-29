import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { approvalRepo, applicationRepo, getDb } from '@/lib/db'
import { sendPushToUserAsync } from '@/lib/push'
import { sendBookingEventAsync } from '@/lib/integration'
import { shiftHours, dayLabelFull, formatSwedishDate } from '@/lib/weeks'

// DELETE = admin removes a previously-approved driver → marks as withdrawn
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string
  const { id } = await params
  const appId = parseInt(id)

  let reason: string | undefined
  try {
    const body = await req.json()
    reason = body?.reason?.trim() || undefined
  } catch { /* body is optional */ }

  // Look up shift + user before mutating so we can notify.
  const sql = getDb()
  const [info] = await sql<{ user_id: string; day_index: number; date: string; user_name: string; was_approved: number }[]>`
    SELECT a.user_id, s.day_index, s.date, u.name AS user_name,
           CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS was_approved
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.id = ${appId}
  `

  await approvalRepo.unapprove(appId)
  await applicationRepo.markWithdrawn(appId, reason, adminId)

  if (info) {
    sendPushToUserAsync(info.user_id, {
      title: 'Pass avbokat',
      body: `Ditt godkända pass ${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)} har avbokats.`,
      url: '/',
      tag: `withdraw-${appId}`,
    })
    // Notify partner system so the name disappears there too. Only meaningful
    // if the booking was actually confirmed (the partner only knows confirmed
    // bookings).
    if (info.was_approved) {
      const { start, end } = shiftHours(info.day_index)
      sendBookingEventAsync({
        event: 'booking.cancelled',
        bookingId: appId,
        driverName: info.user_name,
        date: info.date,
        startTime: start,
        endTime: end,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
