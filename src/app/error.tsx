'use client'

/**
 * Route-segment error boundary. Catches crashes inside pages so they show a
 * readable error + recovery actions instead of a blank white screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', background: '#0D1117', color: '#fff', boxSizing: 'border-box' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/pn-logo.png" alt="PostNord" width={56} height={56} style={{ borderRadius: 12 }} />
      <h1 style={{ fontSize: 18, margin: 0 }}>Något gick fel</h1>
      <p style={{ fontSize: 14, color: '#9CA3AF', margin: 0, maxWidth: 320 }}>
        Prova att ladda om, eller återställ appen om det inte hjälper.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={() => reset()} style={btn('#0033A0')}>Ladda om</button>
        <button onClick={hardReset} style={btn('#374151')}>Återställ appen</button>
      </div>
      <pre style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: 340, maxHeight: 180, overflow: 'auto', textAlign: 'left', margin: '8px 0 0' }}>
        {error?.message || 'Okänt fel'}{error?.digest ? `\n(${error.digest})` : ''}
      </pre>
    </div>
  )
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }
}
