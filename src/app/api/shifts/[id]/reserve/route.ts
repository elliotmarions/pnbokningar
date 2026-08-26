import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo, getDb, logActivityAsync } from '@/lib/db'
import { sendPushToUserAsync } from '@/lib/push'
import { formatSwedishDate, dayLabelFull } from '@/lib/weeks'

// POST /api/shifts/[id]/reserve
// Adds a driver straight onto the reserve list for a shift — the manual
// counterpart to /api/shifts/[id]/book, which books the driver in as approved.
// Works whether or not the driver already has an application for the shift.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const shiftId = parseInt((await params).id)
  const { userId } = await req.json() as { userId: string }

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const sql = getDb()

  const [existing] = await sql<{ id: number; reserve: number }[]>`
    SELECT id, reserve FROM applications WHERE shift_id = ${shiftId} AND user_id = ${userId}
  `

  let appId: number
  if (existing) {
    if (existing.reserve === 1) return NextResponse.json({ ok: true }) // already reserve
    appId = existing.id
    await sql.begin(async tx => {
      // Drop any approval so the driver isn't both approved AND reserve, and
      // clear rejected/withdrawn — landing on the reserve list is a fresh state.
      await tx`DELETE FROM approvals WHERE application_id = ${appId}`
      await tx`
        UPDATE applications
        SET reserve = 1, withdrawn = 0, withdrawal_reason = NULL, rejected = 0, rejection_reason = NULL
        WHERE id = ${appId}
      `
    })
  } else {
    const app = await applicationRepo.apply(shiftId, userId, true, 'admin')
    appId = app.id
  }

  const [info] = await sql<{
    day_index: number; date: string; user_name: string
  }[]>`
    SELECT s.day_index, s.date, u.name AS user_name
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ${appId}
  `

  // Same wording as /api/applications/[id]/reserve so the driver can't mistake
  // this for an approved shift.
  if (info) {
    sendPushToUserAsync(userId, {
      title: 'Du står på reservlistan',
      body: `Du är reserv för ${dayLabelFull(info.day_index)} ${formatSwedishDate(info.date)}. Du får besked om du blir inbokad.`,
      url: '/',
      tag: `reserve-${appId}`,
    })
    logActivityAsync({
      action: 'reserved',
      actorName: session.user.name ?? null,
      driverName: info.user_name,
      shiftDate: info.date,
      dayIndex: info.day_index,
      detail: 'Tillagd som reserv manuellt',
    })
  }

  return NextResponse.json({ ok: true })
}
