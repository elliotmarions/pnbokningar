import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { activityRepo } from '@/lib/db'

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const entries = await activityRepo.recent(300)
  return NextResponse.json({ entries })
}
