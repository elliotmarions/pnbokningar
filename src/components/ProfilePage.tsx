'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Mail, User, LogOut, ChevronLeft, Check } from './Icons'
import { useSignOut } from '@/lib/supabase/use-user'
import { PushNotificationToggle } from './PushNotificationToggle'

interface Props {
  name: string
  email: string | null
  role: 'driver' | 'admin'
  phone: string | null
}

const PHONE_RE = /^\+?[0-9\s-]{7,20}$/

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function ProfilePage({ name, email, role, phone: initialPhone }: Props) {
  const router = useRouter()
  const signOut = useSignOut()
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [savedPhone, setSavedPhone] = useState(initialPhone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  const dirty = phone.trim() !== (savedPhone ?? '').trim()

  const handleSave = async () => {
    setError('')
    const trimmed = phone.trim()
    if (!PHONE_RE.test(trimmed)) {
      setError('Ange ett giltigt telefonnummer, t.ex. +46701234567.')
      return
    }

    // Optimistic: flash "Sparat!" instantly, treat as saved. If the server
    // rejects, restore previous savedPhone and surface the error.
    const previousSaved = savedPhone
    setSavedPhone(trimmed)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
    setSaving(true)

    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSavedPhone(previousSaved)
        setSavedFlash(false)
        setError(data?.error ?? 'Kunde inte spara.')
      }
    } catch {
      setSavedPhone(previousSaved)
      setSavedFlash(false)
      setError('Kunde inte spara.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="profile-card">
        <button
          onClick={() => router.back()}
          className="profile-back"
          aria-label="Tillbaka"
        >
          <ChevronLeft className="svg-ico" />
          Tillbaka
        </button>

        <div className="profile-header">
          <div className="profile-avatar">{initials(name)}</div>
          <div>
            <div className="profile-name">{name}</div>
            <div className="profile-role">{role === 'admin' ? 'Trafikledare' : 'Chaufför'}</div>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-field">
            <label>
              <User className="svg-ico svg-ico-sm" />
              Namn
            </label>
            <div className="profile-readonly">{name}</div>
            <div className="profile-hint">Hämtas från Microsoft-kontot</div>
          </div>

          <div className="profile-field">
            <label>
              <Mail className="svg-ico svg-ico-sm" />
              E-post
            </label>
            <div className="profile-readonly">{email ?? '—'}</div>
            <div className="profile-hint">Hämtas från Microsoft-kontot</div>
          </div>

          <div className="profile-field">
            <label>
              <Phone className="svg-ico svg-ico-sm" />
              Telefonnummer
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+46701234567"
              disabled={saving}
              className="profile-input"
            />
            <div className="profile-hint">Används av trafikledningen för att nå dig vid frågor om pass.</div>
            {error && <div className="profile-error">{error}</div>}
            {savedFlash && <div className="profile-success">Sparat!</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                <Check className="svg-ico svg-ico-sm" />
                {saving ? 'Sparar…' : 'Spara nummer'}
              </button>
              {dirty && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => { setPhone(savedPhone); setError('') }}
                  disabled={saving}
                >
                  Ångra
                </button>
              )}
            </div>
          </div>

          <PushNotificationToggle />
        </div>

        <button onClick={signOut} className="profile-signout">
          <LogOut className="svg-ico" />
          Logga ut
        </button>
      </div>
    </div>
  )
}
