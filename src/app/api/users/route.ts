import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireAdmin } from '@/lib/auth'
import { userRepo } from '@/lib/db'

// GET /api/users — list all users (admin only)
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(userRepo.all())
}

// PATCH /api/users — update phone or role for current user (or admin can update others)
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

  if (body.phone !== undefined) userRepo.updatePhone(targetId, body.phone)
  if (body.setRole !== undefined && role === 'admin') userRepo.setRole(targetId, body.setRole)

  return NextResponse.json(userRepo.getById(targetId))
}
