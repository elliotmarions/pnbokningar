import webpush from 'web-push'
import { pushSubscriptionRepo, type DbPushSubscription } from './db'

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

// Deliver a payload to a set of subscriptions, cleaning up dead ones.
async function deliver(subs: DbPushSubscription[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return
  const json = JSON.stringify(payload)
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: 60 * 60 * 24 } // 24h — drop if undelivered
        )
        // Delivery accepted by the push service → subscription is alive.
        await pushSubscriptionRepo.touchByEndpoint(s.endpoint)
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          try { await pushSubscriptionRepo.deleteByEndpoint(s.endpoint) } catch {}
        } else {
          console.error('[push] send failed', { endpoint: s.endpoint.slice(0, 40), err })
        }
      }
    })
  )
}

/**
 * Send a push notification to all subscribed devices for a user.
 * Silently no-ops if VAPID keys aren't configured.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  configure()
  if (!_configured) return
  try {
    const subs = await pushSubscriptionRepo.forUser(userId)
    await deliver(subs, payload)
  } catch (err) {
    console.error('[push] failed to load subscriptions', err)
  }
}

/** Broadcast a push notification to every driver with notifications enabled. */
export async function sendPushToAllDrivers(payload: PushPayload): Promise<void> {
  configure()
  if (!_configured) return
  try {
    const subs = await pushSubscriptionRepo.allForDrivers()
    await deliver(subs, payload)
  } catch (err) {
    console.error('[push] broadcast failed to load subscriptions', err)
  }
}

/** Fire-and-forget wrapper for use in API routes — never blocks the response on push delivery. */
export function sendPushToUserAsync(userId: string, payload: PushPayload): void {
  sendPushToUser(userId, payload).catch((err) => console.error('[push] async error', err))
}
