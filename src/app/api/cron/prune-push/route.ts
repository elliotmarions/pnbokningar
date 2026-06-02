import { NextRequest, NextResponse } from 'next/server'
import { pushSubscriptionRepo } from '@/lib/db'

// Subscriptions are refreshed (last_seen bumped) on every successful push
// delivery, and the whole driver list is pinged at least weekly by the
// auto-open broadcast. So anything not seen for this long is effectively dead
// (e.g. a deleted iOS PWA whose endpoint silently stopped accepting pushes).
const STALE_DAYS = 30

/**
 * Daily cleanup of stale push subscriptions, so the "notiser på" indicator
 * stays honest. Scheduled via vercel.json. Truly-dead endpoints are usually
 * removed sooner (a 404/410 on the next send deletes them immediately) — this
 * is the long-tail safety net for endpoints that stop responding without a
 * clean 410.
 *
 * Pass ?force=1 (with the cron secret) to run manually.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qp = new URL(req.url).searchParams.get('secret')
    if (auth !== `Bearer ${secret}` && qp !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const removed = await pushSubscriptionRepo.pruneStale(STALE_DAYS)
  return NextResponse.json({ ok: true, removed, staleDays: STALE_DAYS })
}
