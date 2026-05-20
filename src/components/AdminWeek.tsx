'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, ChevronLeft, ChevronRight, FileSpreadsheet, Phone } from './Icons'
import { Toast, useToast } from './Toast'
import { useAdminCache } from './AdminCacheProvider'

interface Shift {
  id: number
  day_index: number
  date: string
  is_open: number
  slots: number
  approved: number
  pending: number
  reserves: number
}
interface DayInfo {
  dayIndex: number
  date: string
  label: string
  shortLabel: string
  startTime: string
  endTime: string
  holiday: { name: string; type: 'holiday' | 'eve' } | null
}
interface Driver {
  id: number
  user_name: string
  user_phone: string | null
}

function fmt(dateStr: string) {
  const months = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function AdminWeek() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekYear, setWeekYear] = useState(0)
  const [weekNumber, setWeekNumber] = useState(0)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [days, setDays] = useState<DayInfo[]>([])
  const [loading, setLoading] = useState(true)
  const { toast, show: showToast, clear: clearToast } = useToast()
  const cache = useAdminCache()
  const loadId = useRef(0)

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [driversMap,  setDriversMap]  = useState<Record<number, Driver[] | 'loading'>>({})
  const [reservesMap, setReservesMap] = useState<Record<number, Driver[]>>({})

  const load = useCallback(async (offset: number) => {
    const id = ++loadId.current
    const base = new Date()
    base.setDate(base.getDate() + offset * 7)
    const tmp = new Date(base); tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const isoYear = tmp.getFullYear()
    const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
    const cacheKey = `weeks-${isoYear}-${isoWeek}`

    const apply = (data: { weekYear: number; weekNumber: number; shifts: Shift[]; days: DayInfo[] }) => {
      setWeekYear(data.weekYear)
      setWeekNumber(data.weekNumber)
      setShifts(data.shifts)
      setDays(data.days)
      setLoading(false)
    }

    const cached = cache.get(cacheKey)
    if (cached) apply(cached as typeof apply extends (d: infer D) => void ? D : never)

    const res = await fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    if (id !== loadId.current) return
    cache.set(cacheKey, data)
    apply(data)

    if (!cache.get('users')) {
      fetch('/api/users').then(r => r.json()).then(u => cache.set('users', u)).catch(() => {})
    }
  }, [cache])

  useEffect(() => {
    setExpandedIds(new Set())
    setDriversMap({})
    setReservesMap({})
    load(weekOffset)
  }, [weekOffset, load])

  const handleCardClick = async (shiftId: number) => {
    const isOpen = expandedIds.has(shiftId)

    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(shiftId)) next.delete(shiftId)
      else next.add(shiftId)
      return next
    })

    // Fetch only on first open and if not already fetched
    if (!isOpen && driversMap[shiftId] === undefined) {
      setDriversMap(prev => ({ ...prev, [shiftId]: 'loading' }))
      try {
        const res = await fetch(`/api/shifts/${shiftId}`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        type Applicant = { approved: number; reserve: number; rejected: number; withdrawn: number; user_name: string; user_phone: string | null; id: number }
        const applicants: Applicant[] = data.applicants ?? []
        const approved:  Driver[] = applicants.filter(a => a.approved).map(a => ({ id: a.id, user_name: a.user_name, user_phone: a.user_phone }))
        const reserves:  Driver[] = applicants.filter(a => a.reserve === 1 && !a.approved && !a.rejected && !a.withdrawn).map(a => ({ id: a.id, user_name: a.user_name, user_phone: a.user_phone }))
        setDriversMap(prev  => ({ ...prev,  [shiftId]: approved }))
        setReservesMap(prev => ({ ...prev,  [shiftId]: reserves }))
      } catch {
        setDriversMap(prev => ({ ...prev, [shiftId]: [] }))
      }
    }
  }

  const handleExportPlanning = () => {
    window.location.href = `/api/export/planning?year=${weekYear}&week=${weekNumber}`
  }

  const totalApproved = useMemo(() => shifts.reduce((s, c) => s + (c.approved ?? 0), 0), [shifts])
  const totalPending = useMemo(() => shifts.reduce((s, c) => s + (c.pending ?? 0), 0), [shifts])

  return (
    <>
      <div className="week-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="week-nav">
            <button className="arrow" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft className="svg-ico" /></button>
            <span className="week-label">Vecka {weekNumber} · {weekYear}</span>
            <button className="arrow" onClick={() => setWeekOffset(o => o + 1)}><ChevronRight className="svg-ico" /></button>
          </div>
          <div className="week-stats">
            Tillsatta <strong>{totalApproved}</strong> · Sökande <strong>{totalPending}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-sm" onClick={handleExportPlanning}>
            <FileSpreadsheet className="svg-ico svg-ico-sm" />
            Exportera till planering
          </button>
        </div>
      </div>

      {loading && shifts.length === 0 ? (
        <div className="week-grid">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="wk-card skel-card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div className="skel" style={{ width:64, height:13, marginBottom:6 }} />
                  <div className="skel" style={{ width:44, height:11 }} />
                </div>
                <div className="skel" style={{ width:56, height:20, borderRadius:20 }} />
              </div>
              <div className="skel" style={{ width:96, height:11, marginTop:14 }} />
              <div className="skel" style={{ width:'100%', height:8, marginTop:16, borderRadius:4 }} />
              <div className="skel" style={{ width:80, height:11, marginTop:10 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="week-grid" style={{ alignItems: 'start' }}>
          {days.map(day => {
            const shift = shifts.find(s => s.day_index === day.dayIndex)
            if (!shift) return null
            const c = { approved: shift.approved ?? 0, pending: shift.pending ?? 0, reserves: shift.reserves ?? 0 }
            const pct = shift.slots > 0 ? Math.min(100, (c.approved / shift.slots) * 100) : 0
            const isFull = c.approved >= shift.slots
            const badgeClass = !shift.is_open ? 'b-closed' : isFull ? 'b-full' : 'b-open'
            const badgeLabel = !shift.is_open ? 'Stängd' : isFull ? 'Fullbokad' : 'Öppen'
            const isExpanded = expandedIds.has(shift.id)
            const drivers  = driversMap[shift.id]
            const reserves = reservesMap[shift.id] ?? []

            return (
              <button
                key={day.dayIndex}
                type="button"
                className={`wk-card ${!shift.is_open ? 'is-closed' : ''} ${isExpanded ? 'is-selected' : ''}`}
                onClick={() => handleCardClick(shift.id)}
              >
                {/* Static card info */}
                <div className="day-line">
                  <div>
                    <div className="day-name">{day.label}</div>
                    <div className="day-date">{fmt(day.date)}</div>
                  </div>
                  <span className={`badge ${badgeClass}`}><span className="pip" />{badgeLabel}</span>
                </div>

                <div className="hours">
                  <Clock className="svg-ico svg-ico-sm" />
                  {day.startTime}–{day.endTime}
                  {!shift.is_open && day.holiday && (
                    <span className={`wk-holiday-tag ${day.holiday.type}`}>
                      {day.holiday.type === 'holiday' ? 'Röd dag' : 'Afton'} · {day.holiday.name}
                    </span>
                  )}
                </div>

                <div>
                  <div className="wk-meter">
                    <span className="num">{c.approved}</span>
                    <span className="denom">/{shift.slots} godkända</span>
                  </div>
                  <div className="wk-meter-bar" style={{ marginTop: 6 }}>
                    <div className={`fill ${isFull ? 'full' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="wk-waiting">{c.pending} väntar på godkännande</div>
                  {c.reserves > 0 && (
                    <div className="wk-reserves">{c.reserves} res.</div>
                  )}
                </div>

                {/* Expanded driver list — drops straight down inside the column */}
                {isExpanded && (
                  <div className="wk-inline-drivers" onClick={e => e.stopPropagation()}>
                    {!drivers || drivers === 'loading' ? (
                      [0,1,2].map(i => (
                        <div key={i} className="wk-driver-row">
                          <div className="skel" style={{ width:30, height:30, borderRadius:'50%', flexShrink:0 }} />
                          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                            <div className="skel" style={{ width:'70%', height:11 }} />
                            <div className="skel" style={{ width:'50%', height:10 }} />
                          </div>
                        </div>
                      ))
                    ) : drivers.length === 0 ? (
                      <p className="wk-drivers-empty">Inga bokade ännu.</p>
                    ) : (
                      drivers.map(d => (
                        <div key={d.id} className="wk-driver-row">
                          <div className="wk-driver-avatar">{initials(d.user_name)}</div>
                          <div className="wk-driver-info">
                            <div className="wk-driver-name">{d.user_name}</div>
                            {d.user_phone && (
                              <div className="wk-driver-phone">
                                <Phone className="svg-ico" style={{ width:11, height:11 }} />
                                {d.user_phone}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Reserve list */}
                    {reserves.length > 0 && (
                      <>
                        <div className="wk-reserves-divider">Reserver</div>
                        {reserves.map(d => (
                          <div key={d.id} className="wk-driver-row wk-reserve-row">
                            <div className="wk-driver-avatar wk-reserve-avatar">{initials(d.user_name)}</div>
                            <div className="wk-driver-info">
                              <div className="wk-driver-name">{d.user_name}</div>
                              {d.user_phone ? (
                                <div className="wk-driver-phone">
                                  <Phone className="svg-ico" style={{ width:11, height:11 }} />
                                  {d.user_phone}
                                </div>
                              ) : (
                                <div className="wk-driver-phone" style={{ opacity: 0.4 }}>Inget nummer</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
    </>
  )
}
