import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { shiftRepo, getDb } from '@/lib/db'

export async function PUT(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { id: number; is_open?: number; slots?: number }[]
  for (const s of body) {
    await shiftRepo.update(s.id, { is_open: s.is_open, slots: s.slots })
  }

  // Auto-apply long-term bookings to shifts being opened
  const { applyLongTermToShift } = await import('@/lib/apply-long-term')
  const adminId = (session.user as Record<string, unknown>).id as string
  const sql = getDb()
  for (const s of body) {
    if (s.is_open === 1) {
      const [shift] = await sql<{ date: string }[]>`SELECT date FROM shifts WHERE id = ${s.id}`
      if (shift) await applyLongTermToShift(s.id, shift.date, adminId)
    }
  }

  return NextResponse.json({ ok: true })
}
