'use client'
import { useState } from 'react'
import { Microsoft } from './Icons'
import { createClient } from '@/lib/supabase/client'

export function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAzure = async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid profile email',
        redirectTo: `${window.location.origin}/auth/callback?next=/driver`,
      },
    })
    if (error) {
      setError('Kunde inte starta inloggningen. Försök igen.')
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark">
          <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
        </div>
        <h1 className="login-title">Passbokning</h1>
        <p className="login-tagline">
          Logga in med ditt PostNord-konto för att se kommande pass och anmäla intresse.
        </p>

        <button className="login-btn" onClick={handleAzure} disabled={loading}>
          <Microsoft />
          {loading ? 'Loggar in…' : 'Logga in med företagskonto'}
        </button>

        {error && (
          <p style={{ color: '#F87171', fontSize: 13, marginTop: 12, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <p className="login-foot">
          Genom att logga in godkänner du villkoren för intern användning.
        </p>
      </div>
    </div>
  )
}
