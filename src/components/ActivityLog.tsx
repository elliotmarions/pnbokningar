'use client'
import { useEffect, useState } from 'react'

interface ActivityEntry {
  id: number
  action: string
  actor_name: string | null
  driver_name: string | null
  shift_date: string | null
  day_index: number | null
  detail: string | null
  created_at: string
}

const DAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  booked:    { label: 'Bokad',   color: '#4ade80', bg: 'rgba(46,160,67,0.14)' },
  cancelled: { label: 'Avbokad', color: '#F87171', bg: 'rgba(218,54,51,0.14)' },
  rejected:  { label: 'Nekad',   color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
}

function fmtActivityDate(dateStr: string | null) {
  if (!dateStr) return ''
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function fmtTimestamp(iso: string) {
  // iso is Europe/Stockholm local text "YYYY-MM-DD HH:MM:SS(.ms)"
  const [datePart, timePart] = iso.split(/[ T]/)
  return `${datePart} ${(timePart ?? '').slice(0, 5)}`
}

export function ActivityLog() {
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const res = await fetch('/api/activity')
      if (!res.ok || cancelled) return
      const data = await res.json()
      setActivity(data.entries ?? [])
    }
    load()
    const interval = setInterval(() => { if (!document.hidden) load() }, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = (activity ?? []).filter(e =>
    !q ||
    (e.driver_name ?? '').toLowerCase().includes(q) ||
    (e.actor_name ?? '').toLowerCase().includes(q)
  )

  return (
    <div className="tbl-wrap">
      <div className="tbl-head">
        <div>
          <div className="ttl">Aktivitetslogg</div>
          <div className="sub">Senaste 300 händelserna · uppdateras automatiskt</div>
        </div>
        <input
          type="text"
          placeholder="Sök namn…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: 'var(--text-primary)', minWidth: 160 }}
        />
      </div>
      {activity === null ? (
        <div style={{ padding: '24px 20px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>Läser in…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px 20px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>
          {q ? 'Inga händelser matchar sökningen.' : 'Inga händelser loggade ännu.'}
        </div>
      ) : (
        <table className="tbl">
          <thead><tr>
            <th>Händelse</th>
            <th>Chaufför</th>
            <th>Pass</th>
            <th>Av</th>
            <th>Tidpunkt</th>
          </tr></thead>
          <tbody>
            {filtered.map(e => {
              const meta = ACTION_META[e.action] ?? { label: e.action, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' }
              const day = e.day_index != null ? DAY_SHORT[e.day_index] : ''
              return (
                <tr key={e.id}>
                  <td data-label="Händelse">
                    <span className="act-pill" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                  </td>
                  <td data-label="Chaufför" style={{ fontWeight: 500 }}>{e.driver_name ?? '—'}</td>
                  <td data-label="Pass" style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
                    {e.shift_date ? `${day} ${fmtActivityDate(e.shift_date)}` : '—'}
                  </td>
                  <td data-label="Av" style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>{e.actor_name ?? '—'}</td>
                  <td data-label="Tidpunkt" style={{ color: 'var(--text-tertiary)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTimestamp(e.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
