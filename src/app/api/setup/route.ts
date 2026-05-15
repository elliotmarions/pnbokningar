import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { userRepo, getDb } from '@/lib/db'

// POST /api/setup — create the first admin user
// Only works when no admins exist yet
export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json() as {
    name: string
    email: string
    password: string
  }

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Namn, e-post och lösenord krävs.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  }

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
