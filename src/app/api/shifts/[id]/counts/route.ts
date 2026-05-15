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
  const sql = getDb()

  const [row] = await sql<{ approved: number; pending: number }[]>`
    SELECT
      COUNT(DISTINCT ap.id)::int AS approved,
      (COUNT(DISTINCT a.id) - COUNT(DISTINCT ap.id))::int AS pending
    FROM applications a
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.shift_id = ${shiftId}
  `

  return NextResponse.json(row ?? { approved: 0, pending: 0 })
}
