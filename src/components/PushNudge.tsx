'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, X } from './Icons'

/**
 * Small banner shown above the driver's day list, nudging them to enable
 * push notifications. Dismissable for 7 days. Hidden when:
 *   - browser doesn't support push
 *   - permission is already granted (already subscribed) OR denied
 *   - user dismissed recently
 *   - SSR (no window)
 */

const DISMISS_KEY = 'pn_push_nudge_dismissed_until'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i)
  return out
}

export function PushNudge() {
  const [visible, setVisible] = useState(false)
  const [working, setWorking] = useState(false)
  const [flash, setFlash] = useState<string>('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return

    // Permission already decided (granted or denied) → hide.
    if (Notification.permission !== 'default') return

    // Recently dismissed → hide.
    try {
      const until = parseInt(localStorage.getItem(DISMISS_KEY) ?? '0', 10)
      if (until && Date.now() < until) return
    } catch { /* ignore storage errors */ }

    // Already has a subscription on this device → hide.
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          const sub = await reg.pushManager.getSubscription()
          if (sub) return
        }
      } catch { /* ignore */ }
      setVisible(true)
    })()
  }, [])

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS)) } catch {}
    setVisible(false)
  }

  const handleEnable = async () => {
    setWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        // User clicked block or dismissed the OS prompt — hide the nudge
        // (we won't be able to re-prompt anyway).
        setVisible(false)
        return
      }

      const keyRes = await fetch('/api/push/vapid-key')
      if (!keyRes.ok) {
        setFlash('Push är inte konfigurerat på servern.')
        return
      }
      const { publicKey } = await keyRes.json()

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setFlash('Notiser aktiverade!')
      setTimeout(() => setVisible(false), 1500)
    } catch (err) {
      console.error('[push-nudge] enable failed', err)
      setFlash('Kunde inte aktivera notiser. Försök igen från Profil.')
    } finally {
      setWorking(false)
    }
  }

  if (!visible) return null

  return (
    <div className="push-nudge">
      <button className="push-nudge-close" onClick={dismiss} aria-label="Stäng">
        <X className="svg-ico svg-ico-sm" />
      </button>
      <div className="push-nudge-icon"><Bell className="svg-ico" /></div>
      <div className="push-nudge-body">
        <div className="push-nudge-title">Få notis direkt vid godkända pass</div>
        <div className="push-nudge-sub">
          {flash || 'Aktivera notiser så vet du direkt när trafikledningen godkänner eller avbokar ditt pass.'}
        </div>
        <div className="push-nudge-actions">
          <button className="btn btn-sm btn-primary" onClick={handleEnable} disabled={working}>
            <Bell className="svg-ico svg-ico-sm" />
            {working ? 'Aktiverar…' : 'Aktivera notiser'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={dismiss} disabled={working}>
            Inte nu
          </button>
          <Link href="/profile" className="push-nudge-link" onClick={dismiss}>
            Hantera i Profil
          </Link>
        </div>
      </div>
    </div>
  )
}
