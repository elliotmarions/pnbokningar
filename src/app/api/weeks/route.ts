import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { shiftRepo } from '@/lib/db'
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
  const shifts = await shiftRepo.ensureWeek(weekYear, weekNumber, info.days)

  const days = info.days.map(d => ({
    ...d,
    holiday: getHolidayInfo(d.date),
  }))

  return NextResponse.json({ weekYear, weekNumber, shifts, days })
}
