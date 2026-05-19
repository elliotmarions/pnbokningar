'use client'
import { Fragment, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Phone } from './Icons'
import { useAdminCache } from './AdminCacheProvider'

interface MonthShift {
  id: number
  day_index: number
  date: string
  is_open: number
  slots: number
  approved: number
  pending: number
}
interface Driver {
  id: number
  user_name: string
  user_phone: string | null
}

const MONTH_NAMES = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December']
const DAY_LABELS  = ['Mån','Tis','Ons','Tor','Fre','Lör']

function monday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
function toStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
function isoWeek(date: Date): number {
  const d = new Date(date)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const w1 = new Date(d.getFullYear(), 0, 4)
  return Math.round(((d.getTime() - w1.getTime()) / 86400000 + (w1.getDay() + 6) % 7) / 7) + 1
}
function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function buildWeeks(year: number, month: number) {
  const first = new Date(year, month - 1, 1)
  const last  = new Date(year, month, 0)
  const start = monday(first)
  const end   = monday(last)
  const weeks: { wk: number; days: { date: string; n: number; inMonth: boolean }[] }[] = []
  let cur = new Date(start)
  while (cur <= end) {
    const days = Array.from({ length: 6 }, (_, i) => {
      const d = addDays(cur, i)
      return { date: toStr(d), n: d.getDate(), inMonth: d.getMonth() + 1 === month && d.getFullYear() === year }
    })
    weeks.push({ wk: isoWeek(cur), days })
    cur = addDays(cur, 7)
  }
  return weeks
}

export function AdminMonth() {
  const now = new Date()
  const todayStr = toStr(now)
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [shifts,   setShifts]   = useState<MonthShift[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [driversMap,  setDriversMap]  = useState<Record<number, Driver[] | 'loading'>>({})
  const cache = useAdminCache()

  useEffect(() => {
    setExpandedIds(new Set())
    setDriversMap({})
    setLoading(true)
    const key = `month-${year}-${month}`
    const cached = cache.get(key) as { shifts: MonthShift[] } | undefined
    if (cached) { setShifts(cached.shifts); setLoading(false) }
    fetch(`/api/months?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(data => { cache.set(key, data); setShifts(data.shifts ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [year, month, cache])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const handleCell = async (shift: MonthShift) => {
    const wasOpen = expandedIds.has(shift.id)
    setExpandedIds(prev => { const s = new Set(prev); wasOpen ? s.delete(shift.id) : s.add(shift.id); return s })
    if (!wasOpen && driversMap[shift.id] === undefined) {
      setDriversMap(prev => ({ ...prev, [shift.id]: 'loading' }))
      try {
        const res  = await fetch(`/api/shifts/${shift.id}`)
        const data = await res.json()
        const approved: Driver[] = (data.applicants ?? []).filter((a: { approved: number }) => a.approved)
        setDriversMap(prev => ({ ...prev, [shift.id]: approved }))
      } catch { setDriversMap(prev => ({ ...prev, [shift.id]: [] })) }
    }
  }

  const shiftByDate = Object.fromEntries(shifts.map(s => [s.date, s]))
  const weeks = buildWeeks(year, month)
  const totalApproved = shifts.reduce((s, c) => s + c.approved, 0)
  const totalPending  = shifts.reduce((s, c) => s + c.pending,  0)

  return (
    <div>
      {/* Header */}
      <div className="week-header">
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div className="week-nav">
            <button className="arrow" onClick={prevMonth}><ChevronLeft className="svg-ico" /></button>
            <span className="week-label">{MONTH_NAMES[month-1]} {year}</span>
            <button className="arrow" onClick={nextMonth}><ChevronRight className="svg-ico" /></button>
          </div>
          <div className="week-stats">
            Tillsatta <strong>{totalApproved}</strong> · Sökande <strong>{totalPending}</strong>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="month-grid">
        {/* Column headers */}
        <div className="month-wk-hdr" />
        {DAY_LABELS.map(l => <div key={l} className="month-day-hdr">{l}</div>)}

        {/* Weeks */}
        {loading
          ? Array.from({ length: 5 }, (_, wi) => (
              <Fragment key={wi}>
                <div className="month-wk-label skel" style={{ height:12, width:24, margin:'auto' }} />
                {Array.from({ length: 6 }, (_, di) => (
                  <div key={di} className="month-cell">
                    <div className="skel" style={{ width:20, height:11, marginBottom:6 }} />
                    <div className="skel" style={{ width:'70%', height:10 }} />
                  </div>
                ))}
              </Fragment>
            ))
          : weeks.map(week => (
              <Fragment key={week.wk}>
                <div className="month-wk-label">v{week.wk}</div>
                {week.days.map(d => {
                  const shift = shiftByDate[d.date]
                  const isToday    = d.date === todayStr
                  const isExpanded = shift ? expandedIds.has(shift.id) : false
                  const drivers    = shift ? driversMap[shift.id] : undefined
                  const isFull     = shift ? shift.approved >= shift.slots : false

                  return (
                    <div
                      key={d.date}
                      className={[
                        'month-cell',
                        !d.inMonth           ? 'out-of-month' : '',
                        isToday              ? 'is-today'     : '',
                        shift?.is_open       ? 'has-shift'    : '',
                        shift && !shift.is_open ? 'is-closed' : '',
                        isExpanded           ? 'is-selected'  : '',
                        shift                ? 'clickable'    : '',
                      ].filter(Boolean).join(' ')}
                      onClick={shift ? () => handleCell(shift) : undefined}
                    >
                      <div className="month-cell-top">
                        <span className="month-cell-day">{d.n}</span>
                        {shift?.is_open ? (
                          <span className={`month-cell-count ${isFull ? 'full' : ''}`}>
                            {shift.approved}/{shift.slots}
                          </span>
                        ) : shift && !shift.is_open && d.inMonth ? (
                          <span className="month-cell-closed">Stängd</span>
                        ) : null}
                      </div>

                      {shift?.is_open && shift.pending > 0 && (
                        <div className="month-cell-pending">
                          <span className="pip" style={{ background:'var(--yellow)', display:'inline-block', width:5, height:5, borderRadius:'50%', marginRight:3 }} />
                          {shift.pending} väntar
                        </div>
                      )}

                      {/* Inline driver list */}
                      {isExpanded && (
                        <div className="month-inline-drivers" onClick={e => e.stopPropagation()}>
                          {!drivers || drivers === 'loading' ? (
                            [0,1,2].map(i => (
                              <div key={i} className="month-driver-row">
                                <div className="skel" style={{ width:22, height:22, borderRadius:'50%', flexShrink:0 }} />
                                <div className="skel" style={{ flex:1, height:10 }} />
                              </div>
                            ))
                          ) : drivers.length === 0 ? (
                            <div className="month-drivers-empty">Inga bokade ännu</div>
                          ) : (
                            drivers.map(dr => (
                              <div key={dr.id} className="month-driver-row">
                                <div className="wk-driver-avatar" style={{ width:22, height:22, fontSize:8.5 }}>
                                  {initials(dr.user_name)}
                                </div>
                                <div style={{ minWidth:0 }}>
                                  <div className="month-driver-name">{dr.user_name}</div>
                                  {dr.user_phone && (
                                    <div className="month-driver-phone">
                                      <Phone className="svg-ico" style={{ width:9, height:9 }} />
                                      {dr.user_phone}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </Fragment>
            ))
        }
      </div>
    </div>
  )
}
