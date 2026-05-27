import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo, getDb } from '@/lib/db'
import { sendPushToUserAsync } from '@/lib/push'
import { dayLabelFull, formatSwedishDate } from '@/lib/weeks'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)
  const { reason } = await req.json() as { reason?: string }

  // Look up shift + user for the push payload before mutating.
  const sql = getDb()
  const [info] = await sql<{ user_id: string; day_index: number; date: string }[]>`
    SELECT a.user_id, s.day_index, s.date
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    WHERE a.id = ${appId}
  `

  await applicationRepo.reject(appId, reason?.trim() || undefined)

  if (info) {
    sendPushToUserAsync(info.user_id, {
      title: 'Pass nekat',
      body: `Din ansökan för ${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)} har nekats.`,
      url: '/',
      tag: `reject-${appId}`,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await applicationRepo.unreject(parseInt(id))
  return NextResponse.json({ ok: true })
}
