import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? '2020-01-01'
  const to   = searchParams.get('to')   ?? '2099-12-31'
  const sql  = getDb()

  // One row per withdrawal, we'll group client-side for the detail view
  const rows = await sql<{
    user_name: string
    shift_date: string
    withdrawal_reason: string | null
  }[]>`
    SELECT
      u.name    AS user_name,
      s.date    AS shift_date,
      a.withdrawal_reason
    FROM applications a
    JOIN shifts  s ON s.id = a.shift_id
    JOIN users   u ON u.id = a.user_id
    WHERE a.withdrawn = 1
      AND s.date BETWEEN ${from} AND ${to}
    ORDER BY u.name, s.date DESC
  `

  return NextResponse.json(rows)
}
