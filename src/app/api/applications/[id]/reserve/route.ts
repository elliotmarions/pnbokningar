import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'

// POST /api/applications/[id]/reserve
// Moves a pending application to the reserve list (sets reserve = 1)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)
  const sql = getDb()

  const [app] = await sql<{ reserve: number; rejected: number; withdrawn: number }[]>`
    SELECT reserve, rejected, withdrawn FROM applications WHERE id = ${appId}
  `
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (app.reserve === 1) return NextResponse.json({ ok: true }) // already reserve

  await sql`UPDATE applications SET reserve = 1 WHERE id = ${appId}`
  return NextResponse.json({ ok: true })
}
