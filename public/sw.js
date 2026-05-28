// Service worker for Web Push notifications + static-asset caching.
// Activated automatically when registered from the client.

const STATIC_CACHE = 'pn-static-v1'

self.addEventListener('install', () => {
  // Take over immediately so first-time subscribers don't need a reload.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop old caches from previous SW versions.
      const keys = await caches.keys()
      await Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

// Speed up PWA launches: serve content-hashed static assets from cache first
// (they're immutable, so this is always safe), and refresh the cache in the
// background. HTML navigations and API calls always go to the network so new
// deploys and live data are never stale.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/pn-logo.png' ||
    url.pathname === '/manifest.json' ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico)$/.test(url.pathname)

  if (!isStaticAsset) return // navigations + API: let the network handle it

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached) // offline → fall back to cache if we have it
      // Cache-first: instant if cached, otherwise wait for network.
      return cached || network
    })
  )
})

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
