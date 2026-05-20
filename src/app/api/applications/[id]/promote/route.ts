import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo, getDb } from '@/lib/db'
import { shiftHours, formatSwedishDate, dayLabelFull } from '@/lib/weeks'
import { sendConfirmationSms } from '@/lib/sms'
import { approvalRepo } from '@/lib/db'

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

  // Send SMS if phone available
  if (info?.user_phone) {
    const { start, end } = shiftHours(info.shift_day_index)
    const result = await sendConfirmationSms({
      to: info.user_phone,
      name: info.user_name,
      dayLabel: dayLabelFull(info.shift_day_index),
      date: formatSwedishDate(info.shift_date),
      startTime: start,
      endTime: end,
    })
    if (result.success) await approvalRepo.markSmsSent(appId)
  }

  return NextResponse.json({ ok: true })
}
