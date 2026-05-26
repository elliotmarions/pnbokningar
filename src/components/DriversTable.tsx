'use client'
import { useEffect, useState } from 'react'
import { Phone } from './Icons'
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
  const { toast, show: showToast, clear: clearToast } = useToast()

  useEffect(() => {
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
          <button className="btn btn-sm btn-danger-ghost" onClick={() => handleDelete(d)}>
            Ta bort
          </button>
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
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Konton skapas automatiskt när chauffören loggar in med Microsoft första gången.
        </div>
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
            <tr>
              <td colSpan={5}>
                <div className="list-group-h" style={{ margin: '4px 0 2px' }}>
                  <span>Trafikledare</span>
                  <span className="badge b-confirmed"><span className="pip" />{admins.length}</span>
                </div>
              </td>
            </tr>
            {renderRows(admins)}

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

      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
    </>
  )
}
