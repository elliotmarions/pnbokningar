import { NextRequest, NextResponse } from 'next/server'
import { shiftRepo } from '@/lib/db'

// Closes open shifts whose start time has passed.
// Called by Vercel cron every 5 minutes.
// Also accepts the Vercel-injected Authorization header automatically.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
    ?? req.headers.get('x-cron-secret')

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const closed = await shiftRepo.closeExpired()
  return NextResponse.json({ closed })
}
