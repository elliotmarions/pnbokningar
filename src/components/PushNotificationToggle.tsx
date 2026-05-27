'use client'
import { useEffect, useState } from 'react'
import { Bell } from './Icons'

/**
 * urlBase64ToUint8Array — converts the VAPID public key (URL-safe base64) into
 * the Uint8Array format the PushManager expects.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'blocked' }
  | { kind: 'idle' }       // supported, not yet subscribed
  | { kind: 'subscribed' }
  | { kind: 'working' }

export function PushNotificationToggle() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [error, setError] = useState<string>('')
  const [flash, setFlash] = useState<string>('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState({ kind: 'unsupported' })
      return
    }
    if (Notification.permission === 'denied') {
      setState({ kind: 'blocked' })
      return
    }

    // Register the SW (idempotent) and check current subscription state.
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setState({ kind: sub ? 'subscribed' : 'idle' })
      } catch (err) {
        console.error('[push] SW registration failed', err)
        setState({ kind: 'unsupported' })
      }
    })()
  }, [])

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  const handleEnable = async () => {
    setError('')
    setState({ kind: 'working' })
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState({ kind: permission === 'denied' ? 'blocked' : 'idle' })
        return
      }

      const keyRes = await fetch('/api/push/vapid-key')
      if (!keyRes.ok) {
        setError('Push är inte konfigurerat på servern än.')
        setState({ kind: 'idle' })
        return
      }
      const { publicKey } = await keyRes.json()

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      const json = sub.toJSON()
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      })
      if (!saveRes.ok) {
        setError('Kunde inte spara prenumerationen.')
        setState({ kind: 'idle' })
        return
      }

      setState({ kind: 'subscribed' })
      showFlash('Notiser aktiverade!')
    } catch (err) {
      console.error('[push] enable failed', err)
      setError('Något gick fel. Försök igen.')
      setState({ kind: 'idle' })
    }
  }

  const handleDisable = async () => {
    setError('')
    setState({ kind: 'working' })
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const endpoint = sub?.endpoint
      if (sub) await sub.unsubscribe()
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
      setState({ kind: 'idle' })
      showFlash('Notiser avstängda.')
    } catch (err) {
      console.error('[push] disable failed', err)
      setError('Kunde inte stänga av notiser.')
      setState({ kind: 'subscribed' })
    }
  }

  const handleTest = async () => {
    setError('')
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      if (!res.ok) {
        setError('Kunde inte skicka testnotis.')
        return
      }
      showFlash('Testnotis skickad — kolla din enhet!')
    } catch {
      setError('Kunde inte skicka testnotis.')
    }
  }

  return (
    <div className="profile-field">
      <label>
        <Bell className="svg-ico svg-ico-sm" />
        Push-notiser
      </label>

      {state.kind === 'loading' && (
        <div className="profile-readonly">Läser in…</div>
      )}

      {state.kind === 'unsupported' && (
        <>
          <div className="profile-readonly">Stöds inte i den här webbläsaren.</div>
          <div className="profile-hint">
            På iPhone: lägg till sidan på hemskärmen (Safari → Dela → Lägg till på hemskärm) och försök igen.
          </div>
        </>
      )}

      {state.kind === 'blocked' && (
        <>
          <div className="profile-readonly">Blockerat</div>
          <div className="profile-hint">
            Du har tidigare blockerat notiser. Aktivera dem manuellt i webbläsarinställningarna för denna sida.
          </div>
        </>
      )}

      {(state.kind === 'idle' || state.kind === 'working') && (
        <>
          <div className="profile-hint">
            Få en notis direkt på din enhet när ett pass godkänns, nekas eller avbokas.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleEnable}
              disabled={state.kind === 'working'}
            >
              <Bell className="svg-ico svg-ico-sm" />
              {state.kind === 'working' ? 'Aktiverar…' : 'Aktivera notiser'}
            </button>
          </div>
        </>
      )}

      {state.kind === 'subscribed' && (
        <>
          <div className="profile-success" style={{ marginTop: 0 }}>Notiser är aktiva på den här enheten.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-ghost" onClick={handleTest}>
              Skicka testnotis
            </button>
            <button className="btn btn-sm btn-ghost" onClick={handleDisable}>
              Stäng av notiser
            </button>
          </div>
        </>
      )}

      {error && <div className="profile-error">{error}</div>}
      {flash && <div className="profile-success">{flash}</div>}
    </div>
  )
}
