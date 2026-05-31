'use client'

/**
 * Root-level error boundary. Without this, any crash during render/hydration
 * unmounts the whole tree and leaves a blank white screen (common on iOS
 * standalone PWAs). This shows the error + recovery actions instead.
 *
 * global-error replaces the root layout, so it must render <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Clears the service worker + caches, then reloads fresh. Fixes the case
  // where a stale cached asset from an old deploy is crashing the app.
  async function hardReset() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch {
      /* best effort */
    }
    location.reload()
  }

  return (
    <html lang="sv">
      <body style={{ margin: 0, background: '#0D1117', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', boxSizing: 'border-box' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pn-logo.png" alt="PostNord" width={56} height={56} style={{ borderRadius: 12 }} />
          <h1 style={{ fontSize: 18, margin: 0 }}>Något gick fel</h1>
          <p style={{ fontSize: 14, color: '#9CA3AF', margin: 0, maxWidth: 320 }}>
            Appen kunde inte starta. Prova att ladda om, eller återställ appen om det inte hjälper.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => reset()} style={btn('#0033A0')}>Ladda om</button>
            <button onClick={hardReset} style={btn('#374151')}>Återställ appen</button>
          </div>
          <pre style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 340, maxHeight: 180, overflow: 'auto', textAlign: 'left', margin: '8px 0 0' }}>
            {error?.message || 'Okänt fel'}{error?.digest ? `\n(${error.digest})` : ''}
          </pre>
        </div>
      </body>
    </html>
  )
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }
}
