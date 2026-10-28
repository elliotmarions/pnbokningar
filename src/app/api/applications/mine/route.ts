import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { applicationRepo } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as Record<string, unknown>).id as string

  // Optional ?from=YYYY-MM-DD — only shifts on or after that date.
  const from = new URL(req.url).searchParams.get('from')
  if (from !== null && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: 'Ogiltigt datum.' }, { status: 400 })
  }

  const apps = await applicationRepo.forUser(userId, from ?? undefined)
  return NextResponse.json(apps)
}
