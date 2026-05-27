import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { pushSubscriptionRepo } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : null

  if (endpoint) {
    await pushSubscriptionRepo.deleteByEndpoint(endpoint)
  } else {
    // No endpoint provided → remove all subscriptions for the user.
    await pushSubscriptionRepo.deleteForUser(session.user.id)
  }

  return NextResponse.json({ ok: true })
}
