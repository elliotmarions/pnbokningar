import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { shiftRepo, applicationRepo, customClosedRepo, getDb } from '@/lib/db'
import { weekInfoFromNumbers, currentWeekInfo } from '@/lib/weeks'
import { getHolidayInfo } from '@/lib/holidays'

export async function GET(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  let weekYear = parseInt(searchParams.get('year') ?? '0')
  let weekNumber = parseInt(searchParams.get('week') ?? '0')

  const current = currentWeekInfo()
  if (!weekYear) weekYear = current.weekYear
  if (!weekNumber) weekNumber = current.weekNumber

  const info = weekInfoFromNumbers(weekYear, weekNumber)

  const { created } = await shiftRepo.ensureWeek(weekYear, weekNumber, info.days)

  // Only run side-effect loops when the week was freshly created.
  // On subsequent loads, these are no-ops anyway and just slow things down.
  if (created) {
    const sessionUser = session.user as Record<string, unknown>
    const adminId = sessionUser.id as string | undefined
    const userRole = sessionUser.role as string | undefined

    const freshShifts = await shiftRepo.getWeek(weekYear, weekNumber)

    // Apply long-term bookings + auto-close custom-closed days in parallel
    const tasks: Promise<unknown>[] = []

    if (adminId && userRole === 'admin') {
      const { applyLongTermToShift } = await import('@/lib/apply-long-term')
      for (const s of freshShifts) {
        tasks.push(applyLongTermToShift(s.id, s.date, adminId))
      }
    }

    for (const s of freshShifts) {
      tasks.push((async () => {
        const ccd = await customClosedRepo.forDate(s.date)
        if (ccd && s.is_open === 1) await shiftRepo.update(s.id, { is_open: 0 })
      })())
    }

    await Promise.all(tasks)
  }

  const shifts = await shiftRepo.getWeekWithCounts(weekYear, weekNumber)
  const days = info.days.map(d => ({ ...d, holiday: getHolidayInfo(d.date) }))

  // Drivers never use applicantsByShift — skip the heavy join entirely for them.
  // Admins get it prefetched so InterestPanel opens instantly.
  const userRole = (session.user as Record<string, unknown>).role as string | undefined
  if (userRole !== 'admin') {
    return NextResponse.json({ weekYear, weekNumber, shifts, days, applicantsByShift: {} })
  }

  const shiftIds = shifts.map(s => s.id)
  const allApplicants = await applicationRepo.forShifts(shiftIds)
  type Applicant = typeof allApplicants[number]
  const applicantsByShift: Record<number, Applicant[]> = {}
  for (const a of allApplicants) {
    if (!applicantsByShift[a.shift_id]) applicantsByShift[a.shift_id] = []
    applicantsByShift[a.shift_id].push(a)
  }

  // How many drivers were approved after this week's planning was last exported?
  // These are the "NYA" names that aren't in the exported file yet — the
  // overview shows a small marker so the admin knows to re-export. Treat a
  // never-exported week as "everything approved is unexported" (epoch baseline).
  const sql = getDb()
  const [{ n: unexportedApprovals }] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM approvals ap
    JOIN applications a ON a.id = ap.application_id
    JOIN shifts s ON s.id = a.shift_id
    WHERE s.week_year = ${weekYear} AND s.week_number = ${weekNumber}
      AND ap.approved_at > COALESCE(
        (SELECT exported_at FROM export_log WHERE week_year = ${weekYear} AND week_number = ${weekNumber}),
        'epoch'::timestamptz
      )
  `

  return NextResponse.json({ weekYear, weekNumber, shifts, days, applicantsByShift, unexportedApprovals })
}
