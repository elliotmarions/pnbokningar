import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { longTermRepo } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { date } = await req.json() as { date: string }
  const excluded = await longTermRepo.toggleExcludeDate(parseInt((await params).id), date)
  return NextResponse.json({ excluded })
}
