import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { pushSubscriptionRepo } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await requireUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }

  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : null
  const keys = (typeof raw.keys === 'object' && raw.keys !== null ? raw.keys : {}) as Record<string, unknown>
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : null
  const auth = typeof keys.auth === 'string' ? keys.auth : null

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Saknar endpoint/keys' }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent')

  await pushSubscriptionRepo.upsert({
    userId: session.user.id,
    endpoint,
    p256dh,
    auth,
    userAgent,
  })

  return NextResponse.json({ ok: true })
}
