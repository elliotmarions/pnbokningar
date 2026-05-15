'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { Microsoft } from './Icons'

interface Props {
  devLogin?: boolean
}

export function Login({ devLogin }: Props) {
  const [devId, setDevId] = useState('test-admin-001')
  const [loading, setLoading] = useState(false)

  const handleAzure = () => {
    setLoading(true)
    signIn('azure-ad', { callbackUrl: '/driver' })
  }

  const handleDev = async () => {
    setLoading(true)
    const res = await signIn('credentials', { userId: devId, callbackUrl: '/driver', redirect: false })
    if (res?.url) window.location.href = res.url
    else setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark">
          <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
          <span className="name">Trafikledning</span>
        </div>
        <h1 className="login-title">Passbokning</h1>
        <p className="login-tagline">
          Logga in för att se kommande pass och anmäla intresse.
        </p>

        <button className="login-btn" onClick={handleAzure} disabled={loading}>
          <Microsoft />
          Logga in med företagskonto
        </button>

        {devLogin && (
          <div style={{ marginTop: 20, padding: '16px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Dev-inloggning
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={devId}
                onChange={e => setDevId(e.target.value)}
                style={{ flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '8px', borderRadius: 6, fontSize: 13 }}
              >
                <option value="test-admin-001">Anna Karlén (admin)</option>
                <option value="test-driver-001">Erik Lindqvist (chaufför)</option>
                <option value="test-driver-002">Sara Bergström (chaufför)</option>
                <option value="test-driver-003">Magnus Holmberg (chaufför)</option>
                <option value="test-driver-004">Anders Sjögren (chaufför)</option>
                <option value="test-driver-005">Linda Karlsson (chaufför)</option>
              </select>
              <button className="btn btn-sm btn-primary" onClick={handleDev} disabled={loading}>
                Logga in
              </button>
            </div>
          </div>
        )}

        <p className="login-foot">
          Genom att logga in godkänner du villkoren för intern användning.
        </p>
      </div>
    </div>
  )
}
