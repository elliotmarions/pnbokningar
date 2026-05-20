import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { userRepo, getDb, ensureMigrated } from '@/lib/db'
import { str, int as _int, EMAIL_RE, fieldError } from '@/lib/validate'

// POST /api/setup — create the first admin user
// Only works when no admins exist yet
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Ogiltig förfrågan.' }, { status: 400 })
  }
  const raw = body as Record<string, unknown>

  const name = str(raw.name, { min: 1, max: 100 })
  const email = str(raw.email, { min: 3, max: 254 })
  const password = str(raw.password, { min: 8, max: 128 })

  if (!name) return NextResponse.json(fieldError('name'), { status: 400 })
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json(fieldError('email'), { status: 400 })
  if (!password) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  }

  await ensureMigrated()
  const sql = getDb()

  // Check if any admin already exists
  const [existing] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'
  `
  if (parseInt(existing?.count ?? '0') > 0) {
    return NextResponse.json({ error: 'En admin finns redan. Kontakta en befintlig admin.' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 12)
  const id = 'local_' + email.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  await sql`
    INSERT INTO users (id, name, email, role, password_hash)
    VALUES (${id}, ${name}, ${email}, 'admin', ${hash})
    ON CONFLICT (id) DO UPDATE SET password_hash = ${hash}, role = 'admin'
  `

  return NextResponse.json({ ok: true })
}
