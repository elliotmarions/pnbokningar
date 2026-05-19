import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { longTermRepo, getDb } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sql = getDb()
  const id = parseInt((await params).id)

  const [booking] = await sql<{ user_id: string; from_date: string; to_date: string; excluded_dates: string }[]>`
    SELECT user_id, from_date, to_date, excluded_dates FROM long_term_bookings WHERE id = ${id}
  `
  if (booking) {
    const excluded: string[] = JSON.parse(booking.excluded_dates)
    const shifts = await sql<{ id: number }[]>`
      SELECT id FROM shifts WHERE date >= ${booking.from_date} AND date <= ${booking.to_date} AND date != ALL(${excluded})
    `
    for (const shift of shifts) {
      const [app] = await sql<{ id: number }[]>`
        SELECT id FROM applications WHERE shift_id = ${shift.id} AND user_id = ${booking.user_id}
      `
      if (app) {
        await sql`DELETE FROM approvals WHERE application_id = ${app.id}`
        await sql`DELETE FROM applications WHERE id = ${app.id}`
      }
    }
  }

  await longTermRepo.delete(id)
  return NextResponse.json({ ok: true })
}
