// Service worker for Web Push notifications.
//
// NOTE: asset caching was intentionally removed. A cache-first strategy could
// serve a stale or broken bundle from a previous deploy and leave the iOS
// standalone PWA stuck on a blank white screen. Push notifications need a
// service worker but no caching, so every request now goes straight to the
// network and the white-screen risk is gone.

self.addEventListener('install', () => {
  // Activate the new SW immediately so the fix lands on next launch.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete ALL caches left by older SW versions — the old cache-first
      // asset cache is the likely cause of the white screen.
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

// No fetch handler — the browser fetches everything from the network as normal.
// This eliminates any chance of the SW serving a broken cached asset.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Passbokning', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Passbokning'
  const options = {
    body: data.body || '',
    icon: data.icon || '/pn-logo.png',
    badge: data.badge || '/pn-logo.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'pnbokningar',
    renotify: true,
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) {
            try { client.navigate(targetUrl) } catch {}
          }
          return
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
