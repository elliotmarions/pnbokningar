import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { longTermRepo, getDb, logActivityAsync } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sql = getDb()
  const id = parseInt((await params).id)
  const adminId = (session.user as Record<string, unknown>).id as string

  const [booking] = await sql<{ user_id: string; user_name: string; from_date: string; to_date: string; excluded_dates: string }[]>`
    SELECT lt.user_id, u.name AS user_name, lt.from_date, lt.to_date, lt.excluded_dates
    FROM long_term_bookings lt
    JOIN users u ON u.id = lt.user_id
    WHERE lt.id = ${id}
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

    const [admin] = await sql<{ name: string }[]>`SELECT name FROM users WHERE id = ${adminId}`
    logActivityAsync({
      action: 'long_term_deleted',
      actorName: admin?.name ?? null,
      driverName: booking.user_name,
      detail: `${booking.from_date} – ${booking.to_date}`,
    })
  }

  await longTermRepo.delete(id)
  return NextResponse.json({ ok: true })
}
