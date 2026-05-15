import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { shiftRepo } from '@/lib/db'

// PUT /api/shifts — bulk update shifts for a week (admin)
// Body: [{ id, is_open?, slots? }, ...]
export async function PUT(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { id: number; is_open?: number; slots?: number }[]
  for (const s of body) {
    shiftRepo.update(s.id, { is_open: s.is_open, slots: s.slots })
  }
  return NextResponse.json({ ok: true })
}
