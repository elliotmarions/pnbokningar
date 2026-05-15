import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { approvalRepo, applicationRepo, userRepo, getDb } from '@/lib/db'
import { sendConfirmationSms } from '@/lib/sms'
import { shiftHours, formatSwedishDate, dayLabelFull } from '@/lib/weeks'

// POST /api/approvals — approve an application
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string
  const { applicationId } = await req.json() as { applicationId: number }

  // Get application + shift info
  const app = getDb().prepare(`
    SELECT a.*, s.day_index, s.date, u.name AS user_name, u.phone AS user_phone
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ?
  `).get(applicationId) as {
    id: number; shift_id: number; user_id: string; day_index: number; date: string;
    user_name: string; user_phone: string | null
  } | undefined

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const approval = approvalRepo.approve(applicationId, adminId)

  // Send confirmation SMS
  if (app.user_phone) {
    const { start, end } = shiftHours(app.day_index)
    const result = await sendConfirmationSms({
      to: app.user_phone,
      name: app.user_name,
      dayLabel: dayLabelFull(app.day_index),
      date: formatSwedishDate(app.date),
      startTime: start,
      endTime: end,
    })
    if (result.success) approvalRepo.markSmsSent(applicationId)
  }

  return NextResponse.json(approval)
}
