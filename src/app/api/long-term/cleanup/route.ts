import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'

// Removes all applications + approvals on closed shifts in a date range.
// Used to clean up orphaned bookings after long-term bookings were deleted.
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { from, to } = await req.json()
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const sql = getDb()

  const apps = await sql<{ id: number }[]>`
    SELECT a.id FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    WHERE s.date >= ${from} AND s.date <= ${to} AND s.is_open = 0
  `

  for (const app of apps) {
    await sql`DELETE FROM approvals WHERE application_id = ${app.id}`
    await sql`DELETE FROM applications WHERE id = ${app.id}`
  }

  return NextResponse.json({ removed: apps.length })
}
