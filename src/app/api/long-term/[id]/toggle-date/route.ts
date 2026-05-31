import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { longTermRepo, getDb } from '@/lib/db'
import { applyLongTermToShift } from '@/lib/apply-long-term'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string
  const id = parseInt((await params).id)
  const { date, force } = await req.json() as { date: string; force?: boolean }

  const sql = getDb()
  const [booking] = await sql<{ user_id: string; excluded_dates: string }[]>`
    SELECT user_id, excluded_dates FROM long_term_bookings WHERE id = ${id}
  `

  // Would this toggle EXCLUDE the day (vs re-include it)?
  let alreadyExcluded = false
  try { alreadyExcluded = (JSON.parse(booking?.excluded_dates || '[]') as string[]).includes(date) } catch {}
  const willExclude = !alreadyExcluded

  // Guard: excluding a day removes the driver's booking for it. If that booking
  // was made independently (the driver applied themselves, or an admin booked
  // them directly — i.e. source <> 'long_term'), warn instead of silently
  // deleting it. The client re-sends with force=true to confirm.
  if (booking && willExclude && !force) {
    const [conflict] = await sql<{ id: number; user_name: string }[]>`
      SELECT a.id, u.name AS user_name
      FROM applications a
      JOIN shifts s ON s.id = a.shift_id
      JOIN users u ON u.id = a.user_id
      WHERE s.date = ${date} AND a.user_id = ${booking.user_id}
        AND a.source <> 'long_term'
        AND a.rejected = 0 AND a.withdrawn = 0
      LIMIT 1
    `
    if (conflict) {
      return NextResponse.json({ warning: 'HAS_OWN_BOOKING', date, driverName: conflict.user_name })
    }
  }

  const excluded = await longTermRepo.toggleExcludeDate(id, date)
  const nowExcluded = excluded.includes(date)

  // Reflect the change onto any existing shift for that date so Schemalägg
  // stays in sync — a date is uniquely tied to one shift, but loop just in case.
  if (booking) {
    const shifts = await sql<{ id: number }[]>`SELECT id FROM shifts WHERE date = ${date}`
    for (const s of shifts) {
      if (nowExcluded) {
        // Day deselected → remove this driver's booking for that day
        // (cascade also clears the approval).
        await sql`DELETE FROM applications WHERE shift_id = ${s.id} AND user_id = ${booking.user_id}`
      } else {
        // Day re-selected → re-apply the long-term booking to that shift.
        await applyLongTermToShift(s.id, date, adminId)
      }
    }
  }

  return NextResponse.json({ excluded })
}
