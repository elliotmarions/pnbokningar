'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { Microsoft } from './Icons'

interface Props {
  azureEnabled?: boolean
}

export function Login({ azureEnabled }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAzure = () => {
    setLoading(true)
    signIn('azure-ad', { callbackUrl: '/driver' })
  }

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', {
      email,
      password,
      callbackUrl: '/driver',
      redirect: false,
    })
    if (res?.url) {
      window.location.href = res.url
    } else {
      setError('Fel e-post eller lösenord.')
      setLoading(false)
    }
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

        {azureEnabled && (
          <>
            <button className="login-btn" onClick={handleAzure} disabled={loading}>
              <Microsoft />
              Logga in med företagskonto
            </button>
            <div className="login-divider"><span>eller</span></div>
          </>
        )}

        <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            placeholder="E-postadress"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={loading}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8,
              fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={loading}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8,
              fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          {error && <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            className="login-btn"
            disabled={loading}
            style={{ marginTop: 2 }}
          >
            {loading ? 'Loggar in…' : 'Logga in'}
          </button>
        </form>

        <p className="login-foot">
          Genom att logga in godkänner du villkoren för intern användning.
        </p>
      </div>
    </div>
  )
}
