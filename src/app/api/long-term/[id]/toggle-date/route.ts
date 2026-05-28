import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { longTermRepo, getDb } from '@/lib/db'
import { applyLongTermToShift } from '@/lib/apply-long-term'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string
  const id = parseInt((await params).id)
  const { date } = await req.json() as { date: string }

  const sql = getDb()
  const [booking] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM long_term_bookings WHERE id = ${id}
  `

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
