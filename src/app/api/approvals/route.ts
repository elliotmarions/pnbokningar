import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { approvalRepo, getDb, logActivityAsync } from '@/lib/db'
import { sendPushToUserAsync } from '@/lib/push'
import { sendBookingEventAsync } from '@/lib/integration'
import { shiftHours, formatSwedishDate, dayLabelFull } from '@/lib/weeks'
import { int, fieldError } from '@/lib/validate'

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const applicationId = int(raw.applicationId, { min: 1 })
  if (applicationId === null) return NextResponse.json(fieldError('applicationId'), { status: 400 })
  const sql = getDb()

  const [app] = await sql<{
    id: number; shift_id: number; user_id: string; day_index: number; date: string;
    user_name: string; user_phone: string | null
  }[]>`
    SELECT a.id, a.shift_id, a.user_id, s.day_index, s.date, u.name AS user_name, u.phone AS user_phone
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ${applicationId}
  `

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const approval = await approvalRepo.approve(applicationId, adminId)

  // Push notification + partner webhook (fire-and-forget)
  {
    const { start, end } = shiftHours(app.day_index)
    sendPushToUserAsync(app.user_id, {
      title: 'Pass godkänt ✅',
      body: `${dayLabelFull(app.day_index)} ${formatSwedishDate(app.date)}, ${start}–${end}`,
      url: '/',
      tag: `approval-${applicationId}`,
    })
    sendBookingEventAsync({
      event: 'booking.confirmed',
      bookingId: applicationId,
      driverName: app.user_name,
      date: app.date,
      startTime: start,
      endTime: end,
    })
    logActivityAsync({
      action: 'booked',
      actorName: session.user.name ?? null,
      driverName: app.user_name,
      shiftDate: app.date,
      dayIndex: app.day_index,
    })
  }

  return NextResponse.json(approval)
}
