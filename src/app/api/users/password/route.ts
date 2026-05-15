import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/auth'
import { userRepo } from '@/lib/db'

// POST /api/users/password — admin sets a password for a user
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, password } = await req.json() as { userId: string; password: string }

  if (!userId || !password) {
    return NextResponse.json({ error: 'userId och password krävs.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 12)
  await userRepo.setPasswordHash(userId, hash)

  return NextResponse.json({ ok: true })
}
