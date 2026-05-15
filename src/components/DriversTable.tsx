'use client'
import { useEffect, useState } from 'react'
import { Phone } from './Icons'
import { Toast, useToast } from './Toast'

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

export function DriversTable() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [editPhone, setEditPhone] = useState('')
  const [pwUserId, setPwUserId] = useState<string | null>(null)
  const [pwValue, setPwValue] = useState('')
  const { toast, show: showToast, clear: clearToast } = useToast()

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setDrivers)
  }, [])

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
        </div>
      </td>
    </tr>
  ))

  return (
    <>
      <div className="drivers-top">
        <h2>Chaufförer ({drivers.length})</h2>
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

      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
    </>
  )
}
