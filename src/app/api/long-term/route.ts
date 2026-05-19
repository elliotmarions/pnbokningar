import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { longTermRepo, shiftRepo, getDb } from '@/lib/db'
import { applyLongTermToShift } from '@/lib/apply-long-term'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const bookings = await longTermRepo.all()
  return NextResponse.json({ bookings })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const adminId = (session.user as Record<string, unknown>).id as string
  const { userId, fromDate, toDate, notes } = await req.json() as {
    userId: string; fromDate: string; toDate: string; notes?: string
  }
  if (!userId || !fromDate || !toDate) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const booking = await longTermRepo.create({ userId, fromDate, toDate, notes, createdBy: adminId })

  // Auto-apply to all existing shifts in the date range
  const sql = getDb()
  const shifts = await sql<{ id: number; date: string }[]>`
    SELECT id, date FROM shifts WHERE date >= ${fromDate} AND date <= ${toDate}
  `
  for (const shift of shifts) {
    await applyLongTermToShift(shift.id, shift.date, adminId)
  }

  return NextResponse.json({ id: booking.id })
}
