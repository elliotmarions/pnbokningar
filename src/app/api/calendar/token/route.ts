import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { userRepo } from '@/lib/db'

// Returns the logged-in user's calendar feed token (generating one on first
// use). The client uses it to build the download + subscribe URLs.
export async function GET() {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = await userRepo.ensureCalendarToken(session.user.id)
  return NextResponse.json({ token })
}
