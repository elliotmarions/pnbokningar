/**
 * SMS reminder script — send reminders for shifts starting within 2 hours.
 * Run manually: npm run remind
 * Or schedule with Windows Task Scheduler / cron:
 *   cron:  *\/15 * * * * cd /path/to/app && npm run remind
 *   Windows Task Scheduler: every 15 minutes
 */

import { approvalRepo } from '../src/lib/db'
import { sendReminderSms } from '../src/lib/sms'

async function main() {
  const pending = approvalRepo.pendingReminders()
  console.log(`[remind] ${pending.length} reminder(s) to send`)

  for (const p of pending) {
    if (!p.user_phone) {
      console.log(`  skip ${p.user_name} — no phone`)
      continue
    }
    console.log(`  → sending to ${p.user_name} (${p.user_phone}) for shift at ${p.start_time}`)
    const result = await sendReminderSms({ to: p.user_phone, startTime: p.start_time, endTime: p.end_time })
    if (result.success) {
      approvalRepo.markReminderSent(p.application_id)
      console.log(`    ✓ sent (${result.sid})`)
    } else {
      console.error(`    ✗ failed: ${result.error}`)
    }
  }
  console.log('[remind] done')
}

main().catch(err => { console.error(err); process.exit(1) })
