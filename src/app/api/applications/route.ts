import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { applicationRepo, shiftRepo } from '@/lib/db'
import { int, bool, fieldError } from '@/lib/validate'

export async function POST(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as Record<string, unknown>).id as string

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>

  const shiftId = int(raw.shiftId, { min: 1 })
  if (shiftId === null) return NextResponse.json(fieldError('shiftId'), { status: 400 })
  const force = raw.force !== undefined ? bool(raw.force) : false
  const reserve = raw.reserve === true

  if (!force && !reserve) {
    const shift = await shiftRepo.getById(shiftId)
    if (shift) {
      const streak = await applicationRepo.consecutiveCount(userId, shift.date)
      if (streak >= 6) {
        return NextResponse.json({ warning: 'CONSECUTIVE_DAYS', count: streak }, { status: 200 })
      }
    }
  }

  try {
    const app = await applicationRepo.apply(shiftId, userId, reserve)
    return NextResponse.json(app)
  } catch (err: unknown) {
    const code = (err as Record<string, unknown>)?.code
    const msg = err instanceof Error ? err.message : String(err)
    if (code === '23505' || msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Already applied' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
