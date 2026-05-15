import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth'
import { userRepo } from '@/lib/db'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await userRepo.all())
}

export async function PATCH(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = (session.user as Record<string, unknown>).id as string
  const role = (session.user as Record<string, unknown>).role as string
  const body = await req.json() as { userId?: string; phone?: string; setRole?: 'driver' | 'admin' }

  const targetId = body.userId ?? currentUserId
  if (targetId !== currentUserId && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (body.phone !== undefined) await userRepo.updatePhone(targetId, body.phone)
  if (body.setRole !== undefined && role === 'admin') await userRepo.setRole(targetId, body.setRole)

  return NextResponse.json(await userRepo.getById(targetId))
}
