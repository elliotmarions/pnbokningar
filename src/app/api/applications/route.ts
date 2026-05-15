import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { applicationRepo, shiftRepo } from '@/lib/db'

// POST /api/applications — apply for a shift
// Body: { shiftId: number, force?: boolean }
export async function POST(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as Record<string, unknown>).id as string
  const { shiftId, force } = await req.json() as { shiftId: number; force?: boolean }

  // Check consecutive days warning (unless driver has confirmed they want to proceed)
  if (!force) {
    const shift = shiftRepo.getById(shiftId)
    if (shift) {
      const streak = applicationRepo.consecutiveCount(userId, shift.date)
      if (streak >= 6) {
        return NextResponse.json({ warning: 'CONSECUTIVE_DAYS', count: streak }, { status: 200 })
      }
    }
  }

  try {
    const app = applicationRepo.apply(shiftId, userId)
    return NextResponse.json(app)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Already applied' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
