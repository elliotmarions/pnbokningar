import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { approvalRepo, applicationRepo } from '@/lib/db'

// DELETE = admin removes a previously-approved driver → marks as withdrawn
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)

  let reason: string | undefined
  try {
    const body = await req.json()
    reason = body?.reason?.trim() || undefined
  } catch { /* body is optional */ }

  await approvalRepo.unapprove(appId)
  await applicationRepo.markWithdrawn(appId, reason)
  return NextResponse.json({ ok: true })
}
