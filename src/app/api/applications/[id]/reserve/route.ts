import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb, logActivityAsync } from '@/lib/db'
import { sendPushToUserAsync } from '@/lib/push'
import { dayLabelFull, formatSwedishDate } from '@/lib/weeks'

// POST /api/applications/[id]/reserve
// Moves an application to the reserve list. Works for both pending and
// already-approved drivers — when moving an approved driver, the approval
// row is deleted so they end up purely on the reserve list.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)
  const sql = getDb()

  // Pull shift + user info up front so we can notify the driver afterwards.
  const [app] = await sql<{
    reserve: number; rejected: number; withdrawn: number
    user_id: string; day_index: number; date: string; user_name: string
  }[]>`
    SELECT a.reserve, a.rejected, a.withdrawn,
           a.user_id, s.day_index, s.date, u.name AS user_name
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ${appId}
  `
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (app.reserve === 1) return NextResponse.json({ ok: true }) // already reserve

  await sql.begin(async tx => {
    // Remove any approval so the driver isn't both approved AND reserve.
    await tx`DELETE FROM approvals WHERE application_id = ${appId}`
    // Clear withdrawn/rejected flags too — moving to reserve is a fresh state.
    await tx`
      UPDATE applications
      SET reserve = 1, withdrawn = 0, withdrawal_reason = NULL, rejected = 0, rejection_reason = NULL
      WHERE id = ${appId}
    `
  })

  // Tell the driver they're on the reserve list — worded so it's clearly NOT
  // an approved shift (avoids the "Pass godkänt"-style confusion).
  sendPushToUserAsync(app.user_id, {
    title: 'Du står på reservlistan',
    body: `Du är reserv för ${dayLabelFull(app.day_index)} ${formatSwedishDate(app.date)}. Du får besked om du blir inbokad.`,
    url: '/',
    tag: `reserve-${appId}`,
  })
  logActivityAsync({
    action: 'reserved',
    actorName: session.user.name ?? null,
    driverName: app.user_name,
    shiftDate: app.date,
    dayIndex: app.day_index,
    detail: 'Flyttad till reservlistan',
  })

  return NextResponse.json({ ok: true })
}
