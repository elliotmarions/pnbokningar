import webpush from 'web-push'
import { pushSubscriptionRepo } from './db'

let _configured = false
function configure() {
  if (_configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:elliot.marions@postnord.com'

  if (!publicKey || !privateKey) {
    // Don't throw at import time — keep the app running even if push isn't configured yet.
    return
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  _configured = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/**
 * Send a push notification to all subscribed devices for a user.
 * Silently no-ops if VAPID keys aren't configured.
 * Cleans up subscriptions that return 404/410 (browser revoked them).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  configure()
  if (!_configured) return

  let subs: Awaited<ReturnType<typeof pushSubscriptionRepo.forUser>>
  try {
    subs = await pushSubscriptionRepo.forUser(userId)
  } catch (err) {
    console.error('[push] failed to load subscriptions', err)
    return
  }
  if (subs.length === 0) return

  const json = JSON.stringify(payload)

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          json,
          { TTL: 60 * 60 * 24 } // 24h — drop if undelivered
        )
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is dead — remove from DB.
          try { await pushSubscriptionRepo.deleteByEndpoint(s.endpoint) } catch {}
        } else {
          console.error('[push] send failed', { endpoint: s.endpoint.slice(0, 40), err })
        }
      }
    })
  )
}

/** Fire-and-forget wrapper for use in API routes — never blocks the response on push delivery. */
export function sendPushToUserAsync(userId: string, payload: PushPayload): void {
  sendPushToUser(userId, payload).catch((err) => console.error('[push] async error', err))
}
