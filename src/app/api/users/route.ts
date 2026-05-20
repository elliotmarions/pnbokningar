import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireUser, requireAdmin } from '@/lib/auth'
import { userRepo } from '@/lib/db'
import { str, oneOf, EMAIL_RE, PHONE_RE, fieldError } from '@/lib/validate'

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

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Ogiltig förfrågan.' }, { status: 400 })
  }
  const raw = body as Record<string, unknown>

  const name = str(raw.name, { min: 1, max: 100 })
  const email = str(raw.email, { min: 3, max: 254 })
  const password = str(raw.password, { min: 8, max: 128 })
  const phone = raw.phone !== undefined ? str(raw.phone, { min: 0, max: 20 }) : undefined

  if (!name) return NextResponse.json(fieldError('name'), { status: 400 })
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json(fieldError('email'), { status: 400 })
  if (!password) return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  if (phone !== undefined && phone !== null && !PHONE_RE.test(phone)) {
    return NextResponse.json(fieldError('phone'), { status: 400 })
  }

  const existing = await userRepo.getByEmail(email)
  if (existing) {
    return NextResponse.json({ error: 'En användare med denna e-post finns redan.' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 12)
  const user = await userRepo.createTemp({
    name,
    email,
    phone: phone || null,
    passwordHash: hash,
  })
  return NextResponse.json(user)
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

  const currentUserId = (session.user as Record<string, unknown>).id as string
  const role = (session.user as Record<string, unknown>).role as string

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
