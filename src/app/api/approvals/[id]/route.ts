import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { approvalRepo, applicationRepo, getDb } from '@/lib/db'
import { sendPushToUserAsync } from '@/lib/push'
import { dayLabelFull, formatSwedishDate } from '@/lib/weeks'

// DELETE = admin removes a previously-approved driver → marks as withdrawn
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)

  let reason: string | undefined
  try {
    const body = await req.json()
    reason = body?.reason?.trim() || undefined
  } catch { /* body is optional */ }

  // Look up shift + user before mutating so we can notify.
  const sql = getDb()
  const [info] = await sql<{ user_id: string; day_index: number; date: string }[]>`
    SELECT a.user_id, s.day_index, s.date
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    WHERE a.id = ${appId}
  `

  await approvalRepo.unapprove(appId)
  await applicationRepo.markWithdrawn(appId, reason)

  if (info) {
    sendPushToUserAsync(info.user_id, {
      title: 'Pass avbokat',
      body: `Ditt godkända pass ${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)} har avbokats.`,
      url: '/',
      tag: `withdraw-${appId}`,
    })
  }

  return NextResponse.json({ ok: true })
}
