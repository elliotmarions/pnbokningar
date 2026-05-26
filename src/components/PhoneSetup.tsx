'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Check } from './Icons'

interface Props {
  userName: string
  redirectTo: string
}

const PHONE_RE = /^\+?[0-9\s-]{7,20}$/

export function PhoneSetup({ userName, redirectTo }: Props) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmed = phone.trim()
    if (!PHONE_RE.test(trimmed)) {
      setError('Ange ett giltigt telefonnummer, t.ex. +46701234567.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Kunde inte spara. Försök igen.')
        setSaving(false)
        return
      }
      router.push(redirectTo)
      router.refresh()
    } catch {
      setError('Något gick fel. Kontrollera din uppkoppling.')
      setSaving(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark">
          <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
          <span className="name">Trafikledning</span>
        </div>
        <h1 className="login-title">Välkommen, {userName.split(' ')[0]}!</h1>
        <p className="login-tagline">
          Innan du kan börja boka pass behöver vi ditt telefonnummer.
          Det används av trafikledningen för att nå dig vid frågor om pass.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
          <div style={{ position: 'relative' }}>
            <Phone className="svg-ico" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, width: 16, height: 16 }} />
            <input
              type="tel"
              autoFocus
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+46701234567"
              disabled={saving}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', padding: '12px 14px 12px 38px', borderRadius: 8,
                fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
          </div>
          {error && (
            <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>{error}</p>
          )}
          <button type="submit" className="login-btn" disabled={saving} style={{ marginTop: 2 }}>
            {saving ? 'Sparar…' : (<><Check className="svg-ico svg-ico-sm" />Spara och fortsätt</>)}
          </button>
        </form>

        <p className="login-foot">
          Du kan ändra ditt nummer senare under profil-inställningar.
        </p>
      </div>
    </div>
  )
}
