import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo, getDb } from '@/lib/db'
import { shiftHours, formatSwedishDate, dayLabelFull } from '@/lib/weeks'
import { sendPushToUserAsync } from '@/lib/push'
import { sendBookingEventAsync } from '@/lib/integration'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string
  const appId = parseInt((await params).id)

  const sql = getDb()

  // Verify it's a reserve application
  const [app] = await sql<{ reserve: number; shift_id: number }[]>`
    SELECT reserve, shift_id FROM applications WHERE id = ${appId}
  `
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!app.reserve) return NextResponse.json({ error: 'Not a reserve' }, { status: 400 })

  const info = await applicationRepo.promote(appId, adminId)

  // Push notification + partner webhook (fire-and-forget)
  if (info) {
    const { start, end } = shiftHours(info.shift_day_index)
    sendPushToUserAsync(info.user_id, {
      title: 'Pass godkänt ✅',
      body: `${dayLabelFull(info.shift_day_index)} ${formatSwedishDate(info.shift_date)}, ${start}–${end}`,
      url: '/',
      tag: `promote-${appId}`,
    })
    sendBookingEventAsync({
      event: 'booking.confirmed',
      bookingId: appId,
      driverName: info.user_name,
      date: info.shift_date,
      startTime: start,
      endTime: end,
    })
  }

  return NextResponse.json({ ok: true })
}
