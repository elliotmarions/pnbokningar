import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth'
import { userRepo } from '@/lib/db'
import { str, oneOf, PHONE_RE, fieldError } from '@/lib/validate'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await userRepo.all())
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const userId = str(raw.userId, { min: 1, max: 128 })
  if (!userId) return NextResponse.json(fieldError('userId'), { status: 400 })

  await userRepo.delete(userId)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = session.user.id
  const role = session.user.role

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>

  const targetId = str(raw.userId, { min: 1, max: 128 }) ?? currentUserId
  if (targetId !== currentUserId && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (raw.phone !== undefined) {
    const phone = str(raw.phone, { min: 0, max: 20 })
    if (phone !== null && phone !== '' && !PHONE_RE.test(phone)) {
      return NextResponse.json(fieldError('phone'), { status: 400 })
    }
    await userRepo.updatePhone(targetId, phone ?? '')
  }
  if (raw.setRole !== undefined && role === 'admin') {
    const setRole = oneOf(raw.setRole, ['driver', 'admin'] as const)
    if (!setRole) return NextResponse.json(fieldError('setRole'), { status: 400 })
    await userRepo.setRole(targetId, setRole)
  }

  return NextResponse.json(await userRepo.getById(targetId))
}
