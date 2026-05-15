import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { applicationRepo } from '@/lib/db'

// GET /api/applications/mine — get logged-in driver's applications
export async function GET() {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as Record<string, unknown>).id as string
  const apps = applicationRepo.forUser(userId)
  return NextResponse.json(apps)
}
