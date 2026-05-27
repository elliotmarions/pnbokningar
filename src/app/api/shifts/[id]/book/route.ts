import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo, approvalRepo, getDb } from '@/lib/db'
import { sendConfirmationSms } from '@/lib/sms'
import { sendPushToUserAsync } from '@/lib/push'
import { shiftHours, formatSwedishDate, dayLabelFull } from '@/lib/weeks'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string
  const shiftId = parseInt((await params).id)
  const { userId } = await req.json() as { userId: string }

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const sql = getDb()

  // Find or create application
  const [existing] = await sql<{ id: number; rejected: number; withdrawn: number }[]>`
    SELECT id, rejected, withdrawn FROM applications WHERE shift_id = ${shiftId} AND user_id = ${userId}
  `

  let appId: number
  if (existing) {
    // Reset any rejected/withdrawn state so we can approve cleanly
    await sql`UPDATE applications SET rejected = 0, withdrawn = 0, rejection_reason = NULL, withdrawal_reason = NULL WHERE id = ${existing.id}`
    // Remove any existing approval so we can re-create it
    await sql`DELETE FROM approvals WHERE application_id = ${existing.id}`
    appId = existing.id
  } else {
    const app = await applicationRepo.apply(shiftId, userId)
    appId = app.id
  }

  // Approve
  await approvalRepo.approve(appId, adminId)

  // Fetch shift + user info for SMS
  const [info] = await sql<{
    day_index: number; date: string; user_name: string; user_phone: string | null
  }[]>`
    SELECT s.day_index, s.date, u.name AS user_name, u.phone AS user_phone
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ${appId}
  `

  // Push notification (fire-and-forget)
  if (info) {
    const { start, end } = shiftHours(info.day_index)
    sendPushToUserAsync(userId, {
      title: 'Pass godkänt ✅',
      body: `${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)}, ${start}–${end}`,
      url: '/',
      tag: `book-${appId}`,
    })
  }

  if (info?.user_phone) {
    const { start, end } = shiftHours(info.day_index)
    const result = await sendConfirmationSms({
      to: info.user_phone,
      name: info.user_name,
      dayLabel: dayLabelFull(info.day_index),
      date: formatSwedishDate(info.date),
      startTime: start,
      endTime: end,
    })
    if (result.success) await approvalRepo.markSmsSent(appId)
  }

  return NextResponse.json({ ok: true })
}
