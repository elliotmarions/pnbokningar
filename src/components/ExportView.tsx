'use client'
import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet } from './Icons'
import { Toast, useToast } from './Toast'
import { useAdminCache } from './AdminCacheProvider'

interface DriverRow { name: string; shifts: number; hours: number; last_shift: string }
interface WeekRow { week_year: number; week_number: number; shifts: number; hours: number; drivers: number; last_date: string }
interface WithdrawalRow { user_name: string; shift_date: string; withdrawal_reason: string | null }
interface WithdrawalGroup {
  name: string
  total: number
  last_date: string
  entries: { date: string; reason: string }[]
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function nWeeksAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n * 7)
  return d.toISOString().slice(0, 10)
}

const WEEKS_CACHE_KEY = 'weeks-current'

function groupWithdrawals(rows: WithdrawalRow[]): WithdrawalGroup[] {
  const map = new Map<string, WithdrawalGroup>()
  for (const r of rows) {
    if (!map.has(r.user_name)) map.set(r.user_name, { name: r.user_name, total: 0, last_date: r.shift_date, entries: [] })
    const g = map.get(r.user_name)!
    g.total++
    if (r.shift_date > g.last_date) g.last_date = r.shift_date
    g.entries.push({ date: r.shift_date, reason: r.withdrawal_reason ?? '–' })
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export function ExportView() {
  const cache = useAdminCache()
  const [from, setFrom] = useState(nWeeksAgoStr(12))
  const [to, setTo] = useState(todayStr())
  const [group, setGroup] = useState<'driver' | 'week'>('driver')
  const [preview, setPreview] = useState<DriverRow[] | WeekRow[]>([])
  const [weekYear, setWeekYear] = useState(0)
  const [weekNumber, setWeekNumber] = useState(0)
  const [withdrawals, setWithdrawals] = useState<WithdrawalGroup[]>([])
  const [wFrom, setWFrom] = useState(nWeeksAgoStr(24))
  const [wTo,   setWTo]   = useState(todayStr())
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set())
  const { toast, show: showToast, clear: clearToast } = useToast()

  useEffect(() => {
    // Use cached current-week info if available (avoids a round-trip on revisit).
    const cached = cache.get(WEEKS_CACHE_KEY) as { weekYear: number; weekNumber: number } | undefined
    if (cached) { setWeekYear(cached.weekYear); setWeekNumber(cached.weekNumber) }
    fetch('/api/weeks').then(r => r.json()).then(d => {
      cache.set(WEEKS_CACHE_KEY, { weekYear: d.weekYear, weekNumber: d.weekNumber })
      setWeekYear(d.weekYear)
      setWeekNumber(d.weekNumber)
    })
  }, [cache])

  useEffect(() => {
    const id = setTimeout(async () => {
      const res = await fetch(`/api/export/preview?from=${from}&to=${to}&group=${group}`)
      if (res.ok) setPreview(await res.json())
    }, 400)
    return () => clearTimeout(id)
  }, [from, to, group])

  useEffect(() => {
    const id = setTimeout(async () => {
      const res = await fetch(`/api/export/withdrawals?from=${wFrom}&to=${wTo}`)
      if (res.ok) {
        const rows: WithdrawalRow[] = await res.json()
        setWithdrawals(groupWithdrawals(rows))
      }
    }, 400)
    return () => clearTimeout(id)
  }, [wFrom, wTo])

  const download = () => {
    window.location.href = `/api/export?from=${from}&to=${to}&group=${group}`
    showToast('Nedladdning startar…')
  }

  const downloadPlanning = () => {
    window.location.href = `/api/export/planning?year=${weekYear}&week=${weekNumber}`
    showToast('Planeringsexport startar…')
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
            <button className="btn btn-sm" onClick={downloadPlanning}>
              <FileSpreadsheet className="svg-ico svg-ico-sm" />
              Exportera till planering
            </button>
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
            <div className="sub">{preview.length} {group === 'driver' ? 'chaufförer' : 'veckor'} · {from} → {to}</div>
          </div>
        </div>
        <table className="tbl">
          {group === 'driver' ? (
            <>
              <thead><tr>
                <th>Namn</th>
                <th className="num">Antal pass</th>
                <th>Senaste pass</th>
              </tr></thead>
              <tbody>
                {(preview as DriverRow[]).map((r, i) => (
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
              type="date" value={wFrom}
              onChange={e => setWFrom(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: 'var(--text-primary)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>–</span>
            <input
              type="date" value={wTo}
              onChange={e => setWTo(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {withdrawals.length === 0 ? (
          <div style={{ padding: '24px 20px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>
            Inga avbokningar under vald period
          </div>
        ) : (
          <table className="tbl">
            <thead><tr>
              <th>Chaufför</th>
              <th className="num">Totalt</th>
              <th>Senaste</th>
              <th>Anledningar</th>
            </tr></thead>
            <tbody>
              {withdrawals.map(g => {
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
                        {!isExpanded && (
                          <span className="wd-reasons-preview">
                            {[...new Set(g.entries.map(e => e.reason).filter(r => r !== '–'))].slice(0, 2).join(' · ') || '–'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && g.entries.map((e, i) => (
                      <tr key={`${g.name}-${i}`} className="wd-detail-row">
                        <td />
                        <td />
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{e.date}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.reason}</td>
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
