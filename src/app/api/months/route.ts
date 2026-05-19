import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { shiftRepo } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  // Support ?from=YYYY-MM-DD&to=YYYY-MM-DD  (used by interval mode)
  // Fallback: ?year=YYYY&month=M  (kept for compatibility)
  let from = searchParams.get('from')
  let to   = searchParams.get('to')

  if (!from || !to) {
    const now = new Date()
    const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()))
    const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
    from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    to   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }

  const shifts = await shiftRepo.getMonthWithCounts(from, to)
  return NextResponse.json({ shifts })
}
