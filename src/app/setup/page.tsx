'use client'
import { useState } from 'react'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    const data = await res.json()
    if (res.ok) {
      setStatus('done')
      setMessage('Admin-konto skapat! Du kan nu logga in.')
    } else {
      setStatus('error')
      setMessage(data.error ?? 'Något gick fel.')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark">
          <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
          <span className="name">Trafikledning</span>
        </div>
        <h1 className="login-title">Skapa admin</h1>
        <p className="login-tagline">
          Skapa ditt admin-konto för att komma igång. Fungerar bara om inget konto finns sedan tidigare.
        </p>

        {status === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#4ade80', marginBottom: 16 }}>✓ {message}</p>
            <a href="/" className="login-btn" style={{ display: 'block', textAlign: 'center' }}>Gå till inloggning</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              placeholder="Ditt namn"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              disabled={status === 'loading'}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8,
                fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <input
              type="email"
              placeholder="E-postadress"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={status === 'loading'}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8,
                fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <input
              type="password"
              placeholder="Lösenord (minst 8 tecken)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={status === 'loading'}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8,
                fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            {status === 'error' && (
              <p style={{ color: '#F87171', fontSize: 13, margin: 0 }}>{message}</p>
            )}
            <button type="submit" className="login-btn" disabled={status === 'loading'}>
              {status === 'loading' ? 'Skapar konto…' : 'Skapa admin-konto'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
