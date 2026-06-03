import { NextRequest, NextResponse } from 'next/server'
import { shiftRepo, customClosedRepo, getDb } from '@/lib/db'
import { nextWeekInfo } from '@/lib/weeks'
import { isHolidayOrEve } from '@/lib/holidays'
import { applyLongTermToShift } from '@/lib/apply-long-term'
import { sendPushToAllDrivers } from '@/lib/push'

/**
 * Auto-open next week's shifts. Intended to run Wednesday evening,
 * Europe/Stockholm. Vercel cron runs in UTC and ignores DST, so we schedule it
 * at both 16:00 and 17:00 UTC on Wednesdays (vercel.json) — that covers both
 * 18:00 local in summer (16:00 UTC) and winter (17:00 UTC).
 *
 * The gate below accepts any Wednesday 18:00–22:59 Stockholm time rather than an
 * exact hour, because Vercel cron timing is best-effort and can be delayed — a
 * strict "hour === 18" check would silently skip the whole week if a trigger
 * landed even an hour late. Re-running is safe: the `ever_opened` guard means a
 * second/late invocation re-opens nothing and re-sends no broadcast.
 *
 * Pass ?force=1 (with the cron secret) to run regardless of the time check.
 */
export async function GET(req: NextRequest) {
  // Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET
  // is set. Also accept the secret as a query param for manual testing.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qp = new URL(req.url).searchParams.get('secret')
    if (auth !== `Bearer ${secret}` && qp !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const force = new URL(req.url).searchParams.get('force') === '1'

  // Stockholm local weekday + hour, derived in a timezone-correct way that does
  // NOT depend on the runtime's own timezone (the previous string-reparse trick
  // only worked because Vercel runs in UTC).
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm',
    weekday: 'long',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? ''
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '-1', 10)

  const isWednesday = weekday === 'Wednesday'
  const inWindow = hour >= 18 && hour <= 22

  if (!force && !(isWednesday && inWindow)) {
    return NextResponse.json({ ok: true, skipped: true, reason: `Not Wed 18:00–22:59 (Sthlm: ${weekday} ${hour}:00)` })
  }

  // Next week relative to today.
  const info = nextWeekInfo()
  const { shifts } = await shiftRepo.ensureWeek(
    info.weekYear,
    info.weekNumber,
    info.days.map(d => ({ dayIndex: d.dayIndex, date: d.date })),
  )

  // Open only shifts that were never opened and aren't locked (holiday/eve/
  // custom-closed). ever_opened guard means a re-run never clobbers an
  // admin's later edits.
  const closed = await customClosedRepo.forDates(shifts.map(s => s.date))
  const toOpen = shifts.filter(s =>
    s.ever_opened === 0 && !isHolidayOrEve(s.date) && !closed.has(s.date)
  )

  await Promise.all(toOpen.map(s => shiftRepo.update(s.id, { is_open: 1 })))

  // Apply any long-term bookings to the freshly-opened shifts. These create
  // approvals, which need a valid users.id as approved_by — use any admin.
  const sql = getDb()
  const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  if (admin) {
    await Promise.all(toOpen.map(s => applyLongTermToShift(s.id, s.date, admin.id)))
  }

  // Notify all drivers that a new week is open — only when shifts were actually
  // opened (i.e. only on the weekly auto-open, never on manual opening).
  if (toOpen.length > 0) {
    await sendPushToAllDrivers({
      title: 'Nya pass öppna! 📅',
      body: `Vecka ${info.weekNumber} är nu öppen för bokning. Säkra dina pass!`,
      url: '/',
      tag: `week-open-${info.weekYear}-${info.weekNumber}`,
    })
  }

  return NextResponse.json({
    ok: true,
    week: `${info.weekNumber}/${info.weekYear}`,
    opened: toOpen.length,
  })
}
