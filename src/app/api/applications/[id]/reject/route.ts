import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { applicationRepo } from '@/lib/db'

// POST /api/applications/[id]/reject — admin rejects an application
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const appId = parseInt(id)
  const { reason } = await req.json() as { reason?: string }
  applicationRepo.reject(appId, reason?.trim() || undefined)
  return NextResponse.json({ ok: true })
}

// DELETE /api/applications/[id]/reject — undo a rejection
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  applicationRepo.unreject(parseInt(id))
  return NextResponse.json({ ok: true })
}
