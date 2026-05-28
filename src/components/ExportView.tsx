'use client'
import { useEffect, useState } from 'react'
import { Download } from './Icons'
import { Toast, useToast } from './Toast'
import { useAdminCache } from './AdminCacheProvider'

interface DriverRow { name: string; shifts: number; hours: number; last_shift: string }
interface WeekRow { week_year: number; week_number: number; shifts: number; hours: number; drivers: number; last_date: string }
interface WithdrawalRow { user_name: string; shift_date: string; withdrawal_reason: string | null; withdrawn_by_name: string | null }
interface WithdrawalGroup {
  name: string
  total: number
  last_date: string
  entries: { date: string; reason: string; by: string | null }[]
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function nWeeksAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n * 7)
  return d.toISOString().slice(0, 10)
}

const previewKey = (from: string, to: string, group: string) => `export-preview-${from}-${to}-${group}`
const withdrawalsKey = (from: string, to: string) => `export-withdrawals-${from}-${to}`

function groupWithdrawals(rows: WithdrawalRow[]): WithdrawalGroup[] {
  const map = new Map<string, WithdrawalGroup>()
  for (const r of rows) {
    if (!map.has(r.user_name)) map.set(r.user_name, { name: r.user_name, total: 0, last_date: r.shift_date, entries: [] })
    const g = map.get(r.user_name)!
    g.total++
    if (r.shift_date > g.last_date) g.last_date = r.shift_date
    g.entries.push({ date: r.shift_date, reason: r.withdrawal_reason ?? '–', by: r.withdrawn_by_name })
  }
  // Sort entries within each group by date DESC so the first one is the most recent
  for (const g of map.values()) g.entries.sort((a, b) => b.date.localeCompare(a.date))
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export function ExportView() {
  const cache = useAdminCache()
  const [from, setFrom] = useState(nWeeksAgoStr(12))
  const [to, setTo] = useState(todayStr())
  const [group, setGroup] = useState<'driver' | 'week'>('driver')
  const [preview, setPreview] = useState<DriverRow[] | WeekRow[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalGroup[]>([])
  const [wFrom, setWFrom] = useState(nWeeksAgoStr(24))
  const [wTo,   setWTo]   = useState(todayStr())
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [wSearch, setWSearch] = useState('')
  // Sort the per-driver preview by number of shifts. 'desc' = most first.
  const [shiftSort, setShiftSort] = useState<'desc' | 'asc'>('desc')
  // Sort the withdrawal history by total withdrawals. 'desc' = most first.
  const [wSort, setWSort] = useState<'desc' | 'asc'>('desc')
  const { toast, show: showToast, clear: clearToast } = useToast()

  const q = search.trim().toLowerCase()
  const wq = wSearch.trim().toLowerCase()
  // Filter the per-driver preview by name. The week grouping isn't name-based
  // so it's left unfiltered.
  const filteredPreview = (() => {
    if (group !== 'driver') return preview
    let rows = preview as DriverRow[]
    if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q))
    rows = [...rows].sort((a, b) => shiftSort === 'desc' ? b.shifts - a.shifts : a.shifts - b.shifts)
    return rows
  })()
  // Withdrawal history has its own independent search field + sort toggle.
  const filteredWithdrawals = (() => {
    let rows = wq ? withdrawals.filter(g => g.name.toLowerCase().includes(wq)) : withdrawals
    rows = [...rows].sort((a, b) => wSort === 'desc' ? b.total - a.total : a.total - b.total)
    return rows
  })()

  useEffect(() => {
    const key = previewKey(from, to, group)
    const cached = cache.get(key) as DriverRow[] | WeekRow[] | undefined
    if (cached) setPreview(cached)
    const id = setTimeout(async () => {
      const res = await fetch(`/api/export/preview?from=${from}&to=${to}&group=${group}`)
      if (res.ok) {
        const data = await res.json()
        cache.set(key, data)
        setPreview(data)
      }
    }, cached ? 400 : 0)
    return () => clearTimeout(id)
  }, [from, to, group, cache])

  useEffect(() => {
    const key = withdrawalsKey(wFrom, wTo)
    const cached = cache.get(key) as WithdrawalRow[] | undefined
    if (cached) setWithdrawals(groupWithdrawals(cached))
    const id = setTimeout(async () => {
      const res = await fetch(`/api/export/withdrawals?from=${wFrom}&to=${wTo}`)
      if (res.ok) {
        const rows: WithdrawalRow[] = await res.json()
        cache.set(key, rows)
        setWithdrawals(groupWithdrawals(rows))
      }
    }, cached ? 400 : 0)
    return () => clearTimeout(id)
  }, [wFrom, wTo, cache])

  const download = () => {
    window.location.href = `/api/export?from=${from}&to=${to}&group=${group}`
    showToast('Nedladdning startar…')
  }

  return (
    <>
      <div className="export-top">
        <div className="eyebrow">EXPORT</div>
        <h2>Sammanställning</h2>
        <div className="helper">Ladda ner data som Excel-fil eller exportera planering för aktuell vecka.</div>
      </div>

      <div className="export-card">
        <div className="export-row">
          <div className="field">
            <label>Från</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>Till</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="field">
            <label>Grupp</label>
            <select value={group} onChange={e => setGroup(e.target.value as 'driver' | 'week')}>
              <option value="driver">Per chaufför</option>
              <option value="week">Per vecka</option>
            </select>
          </div>
          <div className="export-actions">
            <button className="btn btn-sm btn-primary" onClick={download}>
              <Download className="svg-ico svg-ico-sm" />
              Ladda ner .xlsx
            </button>
          </div>
        </div>
      </div>

      <div className="tbl-wrap">
        <div className="tbl-head">
          <div>
            <div className="ttl">Förhandsvisning</div>
            <div className="sub">{filteredPreview.length} {group === 'driver' ? 'chaufförer' : 'veckor'} · {from} → {to}</div>
          </div>
          <input
            type="text"
            placeholder="Sök chaufför…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: 'var(--text-primary)', minWidth: 180 }}
          />
        </div>
        <table className="tbl">
          {group === 'driver' ? (
            <>
              <thead><tr>
                <th>Namn</th>
                <th
                  className="num"
                  onClick={() => setShiftSort(s => s === 'desc' ? 'asc' : 'desc')}
                  style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  title="Sortera efter antal pass"
                >
                  Antal pass <span style={{ opacity: 0.7 }}>{shiftSort === 'desc' ? '▼' : '▲'}</span>
                </th>
                <th>Senaste pass</th>
              </tr></thead>
              <tbody>
                {(filteredPreview as DriverRow[]).map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="num">{r.shifts}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.last_shift}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr>
                <th>Vecka</th>
                <th className="num">Antal pass</th>
                <th className="num">Unika chaufförer</th>
                <th>Senaste datum</th>
              </tr></thead>
              <tbody>
                {(preview as WeekRow[]).map((r, i) => (
                  <tr key={i}>
                    <td>V.{r.week_number} {r.week_year}</td>
                    <td className="num">{r.shifts}</td>
                    <td className="num">{r.drivers}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.last_date}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
      {/* ── Withdrawal history ── */}
      <div className="tbl-wrap" style={{ marginTop: 32 }}>
        <div className="tbl-head">
          <div>
            <div className="ttl">Avbokningshistorik</div>
            <div className="sub">Chaufförer som avbokat godkända pass — sorterat efter antal</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              placeholder="Sök chaufför…"
              value={wSearch}
              onChange={e => setWSearch(e.target.value)}
              style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: 'var(--text-primary)', minWidth: 160 }}
            />
            <input
              type="date" value={wFrom}
              onChange={e => setWFrom(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: 'var(--text-primary)', colorScheme: 'dark' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>–</span>
            <input
              type="date" value={wTo}
              onChange={e => setWTo(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: 'var(--text-primary)', colorScheme: 'dark' }}
            />
          </div>
        </div>

        {filteredWithdrawals.length === 0 ? (
          <div style={{ padding: '24px 20px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>
            {wq ? 'Ingen chaufför matchar sökningen' : 'Inga avbokningar under vald period'}
          </div>
        ) : (
          <table className="tbl">
            <thead><tr>
              <th>Chaufför</th>
              <th
                className="num"
                onClick={() => setWSort(s => s === 'desc' ? 'asc' : 'desc')}
                style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                title="Sortera efter antal avbokningar"
              >
                Totalt <span style={{ opacity: 0.7 }}>{wSort === 'desc' ? '▼' : '▲'}</span>
              </th>
              <th>Senaste</th>
              <th>Anledningar</th>
              <th>Avbokad av</th>
            </tr></thead>
            <tbody>
              {filteredWithdrawals.map(g => {
                const isExpanded = expandedDrivers.has(g.name)
                const toggle = () => setExpandedDrivers(prev => {
                  const next = new Set(prev)
                  next.has(g.name) ? next.delete(g.name) : next.add(g.name)
                  return next
                })
                return (
                  <>
                    <tr
                      key={g.name}
                      className="wd-summary-row"
                      onClick={toggle}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 500 }}>
                        <span className="wd-chevron">{isExpanded ? '▾' : '▸'}</span>
                        {g.name}
                      </td>
                      <td className="num">
                        <span className={`wd-count ${g.total >= 3 ? 'wd-count-high' : g.total >= 2 ? 'wd-count-mid' : ''}`}>
                          {g.total}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{g.last_date}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12, maxWidth: 260 }}>
                        {!isExpanded && (() => {
                          // Entries are sorted DESC by date in SQL — the first one is the most recent
                          const latest = g.entries[0]?.reason
                          return (
                            <span className="wd-reasons-preview">
                              {latest && latest !== '–' ? latest : '–'}
                            </span>
                          )
                        })()}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {!isExpanded && (g.entries[0]?.by ?? '–')}
                      </td>
                    </tr>
                    {isExpanded && g.entries.map((e, i) => (
                      <tr key={`${g.name}-${i}`} className="wd-detail-row">
                        <td />
                        <td />
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{e.date}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.reason}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.by ?? '–'}</td>
                      </tr>
                    ))}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
    </>
  )
}
