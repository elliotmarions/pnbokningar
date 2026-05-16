import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo } from '@/lib/db'

// DELETE = undo "withdrawn" status, putting the driver back to pending
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await applicationRepo.unmarkWithdrawn(parseInt(id))
  return NextResponse.json({ ok: true })
}
