import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'

// GET /api/export/preview?from=...&to=...&group=driver|week
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? '2020-01-01'
  const to = searchParams.get('to') ?? '2099-12-31'
  const group = searchParams.get('group') ?? 'driver'
  const db = getDb()

  if (group === 'driver') {
    const rows = db.prepare(`
      SELECT u.name, COUNT(ap.id) AS shifts,
             MAX(s.date) AS last_shift
      FROM approvals ap
      JOIN applications a ON a.id = ap.application_id
      JOIN shifts s ON s.id = a.shift_id
      JOIN users u ON u.id = a.user_id
      WHERE s.date BETWEEN ? AND ?
      GROUP BY u.id, u.name
      ORDER BY u.name
    `).all(from, to)
    return NextResponse.json(rows)
  }

  const rows = db.prepare(`
    SELECT s.week_year, s.week_number,
           COUNT(ap.id) AS shifts,
           COUNT(DISTINCT a.user_id) AS drivers,
           MAX(s.date) AS last_date
    FROM approvals ap
    JOIN applications a ON a.id = ap.application_id
    JOIN shifts s ON s.id = a.shift_id
    WHERE s.date BETWEEN ? AND ?
    GROUP BY s.week_year, s.week_number
    ORDER BY s.week_year, s.week_number
  `).all(from, to)
  return NextResponse.json(rows)
}
