'use client'
import { useEffect, useState } from 'react'
import { Phone, Plus, X, Check } from './Icons'
import { Toast, useToast } from './Toast'
import { useAdminCache } from './AdminCacheProvider'

interface Driver {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: 'driver' | 'admin'
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const CACHE_KEY = 'users'

export function DriversTable() {
  const cache = useAdminCache()
  const [drivers, setDrivers] = useState<Driver[]>(() => (cache.get(CACHE_KEY) as Driver[]) ?? [])
  const [loading, setLoading] = useState(!cache.get(CACHE_KEY))
  const [editId, setEditId] = useState<string | null>(null)
  const [editPhone, setEditPhone] = useState('')
  const [pwUserId, setPwUserId] = useState<string | null>(null)
  const [pwValue, setPwValue] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const { toast, show: showToast, clear: clearToast } = useToast()

  useEffect(() => {
    // Stale-while-revalidate: if cache exists, data is already shown —
    // refresh silently in background; otherwise show loading skeleton.
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        cache.set(CACHE_KEY, data)
        setDrivers(data)
        setLoading(false)
      })
  }, [cache])

  const savePhone = async (id: string) => {
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, phone: editPhone }),
    })
    if (res.ok) {
      setDrivers(prev => prev.map(d => d.id === id ? { ...d, phone: editPhone } : d))
      setEditId(null)
      showToast('Telefonnummer uppdaterat')
    }
  }

  const savePassword = async (userId: string) => {
    if (pwValue.length < 8) { showToast('Lösenordet måste vara minst 8 tecken.'); return }
    const res = await fetch('/api/users/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password: pwValue }),
    })
    if (res.ok) {
      setPwUserId(null)
      setPwValue('')
      showToast('Lösenord uppdaterat')
    }
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim() || newPassword.length < 8) {
      showToast('Fyll i namn, e-post och lösenord (minst 8 tecken).', 'error')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, phone: newPhone || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Kunde inte skapa.', 'error'); return }
      setDrivers(prev => [...prev, data])
      cache.set(CACHE_KEY, [...drivers, data])
      setShowCreate(false)
      setNewName(''); setNewEmail(''); setNewPhone(''); setNewPassword('')
      showToast('Tillfällig chaufför skapad.')
    } finally { setCreating(false) }
  }

  const handleDelete = async (d: Driver) => {
    if (!confirm(`Ta bort ${d.name}?`)) return
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: d.id }),
    })
    if (res.ok) {
      setDrivers(prev => prev.filter(u => u.id !== d.id))
      showToast('Borttagen.')
    } else showToast('Kunde inte ta bort.', 'error')
  }

  const toggleRole = async (d: Driver) => {
    const newRole = d.role === 'admin' ? 'driver' : 'admin'
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: d.id, setRole: newRole }),
    })
    if (res.ok) {
      setDrivers(prev => prev.map(u => u.id === d.id ? { ...u, role: newRole } : u))
      showToast(`${d.name} är nu ${newRole === 'admin' ? 'admin' : 'chaufför'}`)
    }
  }

  const admins = drivers.filter(d => d.role === 'admin')
  const driverOnly = drivers.filter(d => d.role === 'driver')

  const renderRows = (list: Driver[]) => list.map(d => (
    <tr key={d.id}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="avatar sm">{initials(d.name)}</div>
          <span style={{ fontWeight: 500 }}>{d.name}</span>
          {d.id.startsWith('temp_') && (
            <span className="badge b-pending" style={{ fontSize: 10 }} title="Tillfälligt konto – ej aktiverat i Azure">
              <span className="pip" />Tillfällig
            </span>
          )}
        </div>
      </td>
      <td style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>{d.email ?? '—'}</td>
      <td>
        {editId === d.id ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="field input"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: 5, fontSize: 13, outline: 'none', width: 160 }}
              value={editPhone}
              onChange={e => setEditPhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') savePhone(d.id); if (e.key === 'Escape') setEditId(null) }}
              autoFocus
              placeholder="+46701234567"
            />
            <button className="btn btn-sm btn-primary" onClick={() => savePhone(d.id)}>Spara</button>
            <button className="btn btn-sm" onClick={() => setEditId(null)}>Avbryt</button>
          </div>
        ) : (
          <span
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: d.phone ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
            onClick={() => { setEditId(d.id); setEditPhone(d.phone ?? '') }}
            title="Klicka för att redigera"
          >
            {d.phone ? <><Phone className="svg-ico svg-ico-sm" />{d.phone}</> : '—'}
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${d.role === 'admin' ? 'b-confirmed' : 'b-closed'}`}>
          <span className="pip" />{d.role === 'admin' ? 'Trafikledare' : 'Chaufför'}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
          <button className="btn btn-sm" onClick={() => toggleRole(d)}>
            {d.role === 'admin' ? 'Ta bort admin' : 'Gör till admin'}
          </button>
          {pwUserId === d.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="password"
                placeholder="Nytt lösenord"
                value={pwValue}
                onChange={e => setPwValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePassword(d.id); if (e.key === 'Escape') setPwUserId(null) }}
                autoFocus
                style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: 5, fontSize: 13, outline: 'none', width: 140 }}
              />
              <button className="btn btn-sm btn-primary" onClick={() => savePassword(d.id)}>Spara</button>
              <button className="btn btn-sm" onClick={() => setPwUserId(null)}>✕</button>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => { setPwUserId(d.id); setPwValue('') }}>
              Sätt lösenord
            </button>
          )}
          {d.id.startsWith('temp_') && (
            <button className="btn btn-sm btn-danger-ghost" onClick={() => handleDelete(d)}>
              Ta bort
            </button>
          )}
        </div>
      </td>
    </tr>
  ))

  if (loading) {
    return (
      <div className="tbl-wrap" style={{ padding: '8px 0' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="skel" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div className="skel" style={{ width: '38%', height: 13 }} />
              <div className="skel" style={{ width: '22%', height: 11 }} />
            </div>
            <div className="skel" style={{ width: 56, height: 20, borderRadius: 20 }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="drivers-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Chaufförer ({drivers.length})</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="svg-ico svg-ico-sm" />
          Lägg till tillfällig chaufför
        </button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Namn</th>
              <th>E-post</th>
              <th>Telefon</th>
              <th>Roll</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {/* Trafikledare section */}
            <tr>
              <td colSpan={5}>
                <div className="list-group-h" style={{ margin: '4px 0 2px' }}>
                  <span>Trafikledare</span>
                  <span className="badge b-confirmed"><span className="pip" />{admins.length}</span>
                </div>
              </td>
            </tr>
            {renderRows(admins)}

            {/* Chaufförer section */}
            <tr>
              <td colSpan={5}>
                <div className="list-group-h" style={{ margin: '12px 0 2px' }}>
                  <span>Chaufförer</span>
                  <span>{driverOnly.length}</span>
                </div>
              </td>
            </tr>
            {renderRows(driverOnly)}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>Tillfällig chaufför</div>
              <button className="close-btn" onClick={() => setShowCreate(false)}><X className="svg-ico" /></button>
            </div>
            <p className="modal-sub">Skapa konto innan chaufförens Azure-konto är aktiverat. När de loggar in via Azure med samma e-post kopplas allt automatiskt över.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
              <div className="field">
                <label>Namn</label>
                <input className="modal-input" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="För- och efternamn" />
              </div>
              <div className="field">
                <label>E-post</label>
                <input className="modal-input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="namn@postnord.com" />
              </div>
              <div className="field">
                <label>Telefon (valfritt)</label>
                <input className="modal-input" type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+46701234567" />
              </div>
              <div className="field">
                <label>Lösenord (minst 8 tecken)</label>
                <input className="modal-input" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Tillfälligt lösenord" />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => setShowCreate(false)}>Avbryt</button>
              <button className="btn btn-sm btn-primary" disabled={creating} onClick={handleCreate}>
                <Check className="svg-ico svg-ico-sm" />
                {creating ? 'Skapar…' : 'Skapa konto'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
    </>
  )
}
