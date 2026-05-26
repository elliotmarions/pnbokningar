import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

/**
 * GET /api/users/me — returns the currently logged-in user's profile
 * including the role from our `users` table (Supabase Auth alone doesn't
 * store it).
 */
export async function GET() {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(session.user)
}
