import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo } from '@/lib/db'
import { emitReserveDelta, reserveSnapshot } from '@/lib/reserve-events'

// DELETE = undo "withdrawn" status, putting the driver back to pending
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)
  // Undoing a withdrawal can revive a reserve that was withdrawn while on the list.
  const beforeReserve = await reserveSnapshot(appId)
  await applicationRepo.unmarkWithdrawn(appId)
  await emitReserveDelta(appId, beforeReserve)
  return NextResponse.json({ ok: true })
}
