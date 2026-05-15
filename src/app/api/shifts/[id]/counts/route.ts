import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const shiftId = parseInt(id)
  const db = getDb()
  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT ap.id) AS approved,
      COUNT(DISTINCT a.id) - COUNT(DISTINCT ap.id) AS pending
    FROM applications a
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.shift_id = ?
  `).get(shiftId) as { approved: number; pending: number }

  return NextResponse.json(row)
}
