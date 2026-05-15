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

  const app = getDb().prepare('SELECT * FROM applications WHERE id = ?').get(appId) as { shift_id: number; user_id: string } | undefined
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role !== 'admin' && app.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const approval = getDb().prepare('SELECT id FROM approvals WHERE application_id = ?').get(appId)
  if (approval && role !== 'admin') {
    return NextResponse.json({ error: 'ALREADY_APPROVED' }, { status: 409 })
  }

  getDb().prepare('DELETE FROM applications WHERE id = ?').run(appId)
  return NextResponse.json({ ok: true })
}
