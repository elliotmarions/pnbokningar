import { NextRequest, NextResponse } from 'next/server'
import { approvalRepo, applicationRepo, getDb } from '@/lib/db'
import { verifyIntegrationKey } from '@/lib/integration'
import { sendPushToUserAsync } from '@/lib/push'
import { dayLabelFull, formatSwedishDate } from '@/lib/weeks'

/**
 * Partner → us: cancel a confirmed booking. Protected by INTEGRATION_API_KEY
 * (Bearer token, server-to-server only). Performs the same withdrawal as the
 * admin "Avboka" action, and notifies the driver via push.
 *
 * Deliberately does NOT emit a booking.cancelled webhook back to the partner —
 * the partner initiated this, so echoing would be redundant and risk a loop.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyIntegrationKey(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appId = parseInt((await params).id)
  if (!Number.isInteger(appId) || appId < 1) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  let reason: string | undefined
  try {
    const body = await req.json()
    reason = typeof body?.reason === 'string' ? body.reason.trim() || undefined : undefined
  } catch { /* body optional */ }

  const sql = getDb()
  const [info] = await sql<{ user_id: string; day_index: number; date: string; was_approved: number }[]>`
    SELECT a.user_id, s.day_index, s.date,
           CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS was_approved
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.id = ${appId}
  `

  if (!info) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  await approvalRepo.unapprove(appId)
  // withdrawn_by left undefined — the cancellation came from the partner system, not an admin.
  await applicationRepo.markWithdrawn(appId, reason ?? 'Avbokad via integration', undefined)

  // Tell the driver their shift was cancelled (same as an admin cancel).
  sendPushToUserAsync(info.user_id, {
    title: 'Pass avbokat',
    body: `Ditt godkända pass ${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)} har avbokats.`,
    url: '/',
    tag: `withdraw-${appId}`,
  })

  return NextResponse.json({ ok: true, bookingId: appId })
}
