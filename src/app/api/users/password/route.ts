import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/auth'
import { userRepo } from '@/lib/db'
import { str, fieldError } from '@/lib/validate'

// POST /api/users/password — admin sets a password for a user
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>

  const userId = str(raw.userId, { min: 1, max: 128 })
  const password = str(raw.password, { min: 8, max: 128 })

  if (!userId) return NextResponse.json(fieldError('userId'), { status: 400 })
  if (!password) return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })

  const hash = await bcrypt.hash(password, 12)
  await userRepo.setPasswordHash(userId, hash)

  return NextResponse.json({ ok: true })
}
