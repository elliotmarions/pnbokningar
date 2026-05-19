import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { shiftRepo, customClosedRepo } from '@/lib/db'
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
  // Ensure week exists (fast path skips if already created)
  await shiftRepo.ensureWeek(weekYear, weekNumber, info.days)
  // Auto-apply long-term bookings to any newly created shifts (admin only)
  const sessionUser = session.user as Record<string, unknown>
  const adminId = sessionUser.id as string | undefined
  const userRole = sessionUser.role as string | undefined
  if (adminId && userRole === 'admin') {
    const { applyLongTermToShift } = await import('@/lib/apply-long-term')
    const freshShifts = await shiftRepo.getWeek(weekYear, weekNumber)
    for (const s of freshShifts) {
      await applyLongTermToShift(s.id, s.date, adminId)
    }
  }
  // Auto-close any shifts that fall on a custom closed day
  const freshShiftsForClose = await shiftRepo.getWeek(weekYear, weekNumber)
  for (const s of freshShiftsForClose) {
    const ccd = await customClosedRepo.forDate(s.date)
    if (ccd && s.is_open === 1) {
      await shiftRepo.update(s.id, { is_open: 0 })
    }
  }

  // Fetch shifts + counts in a single query (replaces N+1 fetch loop on the client)
  const shifts = await shiftRepo.getWeekWithCounts(weekYear, weekNumber)

  const days = info.days.map(d => ({
    ...d,
    holiday: getHolidayInfo(d.date),
  }))

  return NextResponse.json({ weekYear, weekNumber, shifts, days })
}
