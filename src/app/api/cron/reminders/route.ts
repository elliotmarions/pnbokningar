import { NextRequest, NextResponse } from 'next/server'
import { approvalRepo } from '@/lib/db'
import { sendReminderSms } from '@/lib/sms'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pending = await approvalRepo.pendingReminders()
  const results: { applicationId: number; success: boolean }[] = []

  for (const p of pending) {
    if (!p.user_phone) continue
    const result = await sendReminderSms({ to: p.user_phone, startTime: p.start_time, endTime: p.end_time })
    if (result.success) {
      await approvalRepo.markReminderSent(p.application_id)
    }
    results.push({ applicationId: p.application_id, success: result.success })
  }

  return NextResponse.json({ sent: results.length, results })
}
