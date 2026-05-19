import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { customClosedRepo, getDb } from '@/lib/db'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const days = await customClosedRepo.all()
  return NextResponse.json({ days })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminId = (session.user as Record<string, unknown>).id as string
  const { date, reason, color } = await req.json() as { date: string; reason: string; color: string }

  if (!date || !reason?.trim()) {
    return NextResponse.json({ error: 'date and reason required' }, { status: 400 })
  }

  const day = await customClosedRepo.create({
    date,
    reason: reason.trim(),
    color: color || '#EF4444',
    createdBy: adminId,
  })

  // Auto-close the shift for this date if it exists
  const sql = getDb()
  await sql`UPDATE shifts SET is_open = 0 WHERE date = ${date} AND is_open = 1`

  return NextResponse.json({ day })
}
