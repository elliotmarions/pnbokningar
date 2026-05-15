import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: rawId } = await params
  const userId = (session.user as Record<string, unknown>).id as string
  const role = (session.user as Record<string, unknown>).role as string
  const appId = parseInt(rawId)
  const sql = getDb()

  const [app] = await sql<{ shift_id: number; user_id: string }[]>`
    SELECT shift_id, user_id FROM applications WHERE id = ${appId}
  `
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role !== 'admin' && app.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [approval] = await sql`SELECT id FROM approvals WHERE application_id = ${appId}`
  if (approval && role !== 'admin') {
    return NextResponse.json({ error: 'ALREADY_APPROVED' }, { status: 409 })
  }

  await sql`DELETE FROM applications WHERE id = ${appId}`
  return NextResponse.json({ ok: true })
}
