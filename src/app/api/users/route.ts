import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireUser, requireAdmin } from '@/lib/auth'
import { userRepo } from '@/lib/db'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await userRepo.all())
}

// Create a temporary driver account (Azure not yet activated).
// When the chauffeur later signs in via Azure with the same email, the temp account is auto-merged.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, email, password, phone } = await req.json() as {
    name: string; email: string; password: string; phone?: string
  }
  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'Namn, e-post och lösenord krävs.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  }

  const existing = await userRepo.getByEmail(email.trim())
  if (existing) {
    return NextResponse.json({ error: 'En användare med denna e-post finns redan.' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 12)
  const user = await userRepo.createTemp({
    name: name.trim(),
    email: email.trim(),
    phone: phone?.trim() || null,
    passwordHash: hash,
  })
  return NextResponse.json(user)
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { userId } = await req.json() as { userId: string }
  if (!userId) return NextResponse.json({ error: 'userId krävs' }, { status: 400 })
  await userRepo.delete(userId)
  return NextResponse.json({ ok: true })
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
