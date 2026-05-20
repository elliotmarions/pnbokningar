import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { shiftRepo, getDb } from '@/lib/db'
import { int, fieldError } from '@/lib/validate'

export async function PUT(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 7) {
    return NextResponse.json({ error: 'body måste vara en array med 1–7 pass.' }, { status: 400 })
  }

  const body: { id: number; is_open?: number; slots?: number }[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return NextResponse.json({ error: 'Ogiltigt pass.' }, { status: 400 })
    const r = item as Record<string, unknown>
    const id = int(r.id, { min: 1 })
    if (id === null) return NextResponse.json(fieldError('id'), { status: 400 })
    const is_open_val = r.is_open !== undefined ? int(r.is_open, { min: 0, max: 1 }) : undefined
    const slots_val = r.slots !== undefined ? int(r.slots, { min: 1, max: 50 }) : undefined
    if (r.is_open !== undefined && is_open_val === null) return NextResponse.json(fieldError('is_open'), { status: 400 })
    if (r.slots !== undefined && slots_val === null) return NextResponse.json(fieldError('slots'), { status: 400 })
    body.push({ id, is_open: is_open_val ?? undefined, slots: slots_val ?? undefined })
  }

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
