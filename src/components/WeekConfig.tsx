'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, Check, Plus, Users } from './Icons'
import { InterestPanel } from './InterestPanel'
import { Toast, useToast } from './Toast'
import { useAdminCache } from './AdminCacheProvider'

interface Shift {
  id: number
  day_index: number
  date: string
  is_open: number
  slots: number
  approved?: number
  pending?: number
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

function fmt(dateStr: string) {
  const months = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

export function WeekConfig() {
  const cache = useAdminCache()
  // isMounted: first-mount cache (see load() below).
  const isMounted = useRef(false)
  // loadId: race-condition guard — stale fetch responses are discarded.
  const loadId = useRef(0)

  const [weekOffset, setWeekOffset] = useState(0)
  const [weekYear, setWeekYear] = useState(0)
  const [weekNumber, setWeekNumber] = useState(0)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [days, setDays] = useState<DayInfo[]>([])
  const [local, setLocal] = useState<Shift[]>([])
  const [draftSlots, setDraftSlots] = useState<Record<number, string>>({})
  const [counts, setCounts] = useState<Record<number, { approved: number; pending: number }>>({})
  const [openShiftId, setOpenShiftId] = useState<number | null>(null)
  const [openWeekDialog, setOpenWeekDialog] = useState(false)
  const [openWeekSlots, setOpenWeekSlots] = useState<Record<number, string>>({})
  const { toast, show: showToast, clear: clearToast } = useToast()

  const load = useCallback(async () => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    const tmp = new Date(base); tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const isoYear = tmp.getFullYear()
    const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
    const cacheKey = `weeks-${isoYear}-${isoWeek}`

    const apply = (data: { weekYear: number; weekNumber: number; shifts: Shift[]; days: DayInfo[] }) => {
      setWeekYear(data.weekYear)
      setWeekNumber(data.weekNumber)
      setShifts(data.shifts)
      setDays(data.days)
      setLocal(data.shifts.map((s: Shift) => ({ ...s })))
      const drafts: Record<number, string> = {}
      data.shifts.forEach((s: Shift) => { drafts[s.id] = String(s.slots) })
      setDraftSlots(drafts)
      const c: Record<number, { approved: number; pending: number }> = {}
      data.shifts.forEach((s: Shift) => {
        c[s.id] = { approved: s.approved ?? 0, pending: s.pending ?? 0 }
      })
      setCounts(c)
    }

    // First mount only: serve from cache to avoid re-fetching data the user
    // just saw in Översikt. Avoids overwriting in-progress edits on revisit.
    if (!isMounted.current) {
      isMounted.current = true
      const cached = cache.get(cacheKey)
      if (cached) { apply(cached as Parameters<typeof apply>[0]); return }
    }

    // Assign a unique id to this call so we can detect stale responses.
    const id = ++loadId.current

    const res = await fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`)
    if (!res.ok) return
    const data = await res.json()

    // Discard response if a newer load() has already been triggered.
    if (id !== loadId.current) return

    cache.set(cacheKey, data)   // keep cache up-to-date for other tabs
    apply(data)
  }, [weekOffset, cache])

  useEffect(() => { load() }, [weekOffset, load])

  const update = (id: number, field: 'is_open' | 'slots', value: number) => {
    setLocal(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    if (field === 'slots') setDraftSlots(prev => ({ ...prev, [id]: String(value) }))
  }

  const save = async () => {
    const res = await fetch('/api/shifts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(local.map(s => ({ id: s.id, is_open: s.is_open, slots: s.slots }))),
    })
    if (res.ok) { showToast('Veckan sparad') }
    else showToast('Fel vid sparande', 'error')
  }

  const reset = () => setLocal(shifts.map(s => ({ ...s })))

  const handleApprove = async (appId: number) => {
    const res = await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: appId }),
    })
    if (res.ok) {
      showToast('Chaufför godkänd. SMS skickat.')
      load() // fire-and-forget — don't block the optimistic UI
    } else {
      showToast('Fel vid godkännande.', 'error')
      throw new Error('approve failed')
    }
  }

  const handleUnapprove = async (appId: number, reason?: string) => {
    const res = await fetch(`/api/approvals/${appId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) {
      showToast('Chaufför avbokad.')
      load()
    } else {
      showToast('Fel.', 'error')
      throw new Error('unapprove failed')
    }
  }

  const handleReject = async (appId: number, reason?: string) => {
    const res = await fetch(`/api/applications/${appId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (res.ok) {
      showToast('Ansökan nekad.')
      load()
    } else {
      showToast('Fel vid nekande.', 'error')
      throw new Error('reject failed')
    }
  }

  const handleUnreject = async (appId: number) => {
    const res = await fetch(`/api/applications/${appId}/reject`, { method: 'DELETE' })
    if (!res.ok) throw new Error('unreject failed')
    load()
  }

  const handleUnwithdraw = async (appId: number) => {
    const res = await fetch(`/api/applications/${appId}/withdraw`, { method: 'DELETE' })
    if (!res.ok) throw new Error('unwithdraw failed')
    load()
  }

  const handleUpdateSlots = async (shiftId: number, slots: number) => {
    await fetch('/api/shifts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: shiftId, slots }]),
    })
    await load()
  }

  const handleOpenWeek = async () => {
    const updates = Object.entries(openWeekSlots).map(([idStr, val]) => {
      const slots = Math.min(50, Math.max(1, parseInt(val) || 5))
      return { id: parseInt(idStr), is_open: 1, slots }
    })
    if (updates.length === 0) {
      showToast('Inga pass att öppna den här veckan.', 'error')
      setOpenWeekDialog(false)
      return
    }
    await fetch('/api/shifts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setOpenWeekDialog(false)
    await load()
    showToast(`${updates.length} pass öppnade.`)
  }

  return (
    <>
      <div className="cfg-top">
        <div>
          <div className="eyebrow">SCHEMALÄGG</div>
          <h2>Vecka {weekNumber} · {weekYear}</h2>
          <div className="helper">Öppna dagar och sätt antal platser inför kommande vecka.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="week-nav">
            <button className="arrow" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft className="svg-ico" /></button>
            <span className="week-label">Vecka {weekNumber} · {weekYear}</span>
            <button className="arrow" onClick={() => setWeekOffset(o => o + 1)}><ChevronRight className="svg-ico" /></button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => {
            const today = new Date()
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            const init: Record<number, string> = {}
            shifts.filter(s => {
              const d = days.find(d => d.dayIndex === s.day_index)
              return d && d.date >= todayStr && !d.holiday
            }).forEach(s => { init[s.id] = '5' })
            setOpenWeekSlots(init)
            setOpenWeekDialog(true)
          }}>
            <Plus className="svg-ico svg-ico-sm" />
            Öppna vecka
          </button>
        </div>
      </div>

      <div className="cfg-grid">
        {days.map(day => {
          const shift = local.find(s => s.day_index === day.dayIndex)
          if (!shift) return null
          const isOpen = !!shift.is_open

          return (
            <div key={day.dayIndex} className={`cfg-card ${isOpen ? 'is-open' : 'is-closed'}`}>
              <div className="top">
                <div>
                  <div className="day-name">{day.label}</div>
                  <div className="day-date">{fmt(day.date)}</div>
                  <div className="hours"><Clock className="svg-ico svg-ico-sm" style={{ verticalAlign: 'middle', marginRight: 4 }} />{day.startTime}–{day.endTime}</div>
                </div>
                <span className={`badge ${isOpen ? 'b-open' : 'b-closed'}`}>
                  <span className="pip" />{isOpen ? 'Öppen' : 'Stängd'}
                </span>
              </div>

              {/* Applicants button */}
              {(() => {
                const c = counts[shift.id] ?? { approved: 0, pending: 0 }
                return (
                  <button
                    className="cfg-applicants-btn"
                    onClick={() => setOpenShiftId(shift.id)}
                    type="button"
                  >
                    <Users className="svg-ico svg-ico-sm" />
                    <span>{c.approved} godkända</span>
                    {c.pending > 0 && <span className="badge b-pending" style={{ fontSize: 11 }}><span className="pip" />{c.pending} väntar</span>}
                  </button>
                )
              })()}

              <div className="cfg-field">
                <label>Öppen för anmälan</label>
                <div
                  className={`tg ${isOpen ? 'on' : ''}`}
                  onClick={() => update(shift.id, 'is_open', isOpen ? 0 : 1)}
                  role="switch"
                  aria-checked={isOpen}
                />
              </div>

              <div className="cfg-field">
                <label>Antal platser</label>
                <div className="num-input">
                  <button disabled={!isOpen} onClick={() => update(shift.id, 'slots', Math.max(1, shift.slots - 1))}>
                    −
                  </button>
                  <input
                    type="number"
                    value={draftSlots[shift.id] ?? shift.slots}
                    min={1}
                    max={50}
                    disabled={!isOpen}
                    style={{ opacity: isOpen ? 1 : 0.5 }}
                    onChange={e => setDraftSlots(prev => ({ ...prev, [shift.id]: e.target.value }))}
                    onBlur={e => {
                      const val = parseInt(e.target.value)
                      const clamped = isNaN(val) || val < 1 ? 1 : Math.min(50, val)
                      update(shift.id, 'slots', clamped)
                    }}
                  />
                  <button disabled={!isOpen} onClick={() => update(shift.id, 'slots', Math.min(50, shift.slots + 1))}>
                    +
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="cfg-actions">
        <button className="btn" onClick={reset}>Återställ</button>
        <button className="btn btn-primary" onClick={save}>
          <Check className="svg-ico svg-ico-sm" />
          Spara vecka
        </button>
      </div>

      <InterestPanel
        open={openShiftId !== null}
        shift={shifts.find(s => s.id === openShiftId) ?? null}
        dayLabel={days.find(d => d.dayIndex === (shifts.find(s => s.id === openShiftId)?.day_index))?.label ?? ''}
        onClose={() => setOpenShiftId(null)}
        onApprove={handleApprove}
        onUnapprove={handleUnapprove}
        onUpdateSlots={handleUpdateSlots}
        onReject={handleReject}
        onUnreject={handleUnreject}
        onUnwithdraw={handleUnwithdraw}
      />

      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />

      {openWeekDialog && (
        <div className="modal-backdrop" onClick={() => setOpenWeekDialog(false)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Öppna vecka {weekNumber}</div>
            <p className="modal-sub">Ange antal platser per dag. Röda dagar, aftnar och förflutna dagar visas inte.</p>

            {/* Quick-fill all */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>Sätt alla till</span>
              <input
                className="modal-input"
                type="number"
                min={1}
                max={50}
                style={{ width: 70, textAlign: 'center' }}
                placeholder="5"
                onChange={e => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v) && v >= 1) {
                    setOpenWeekSlots(prev => Object.fromEntries(Object.keys(prev).map(k => [k, String(Math.min(50, v))])))
                  }
                }}
              />
            </div>

            {/* Per-day rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              {Object.entries(openWeekSlots).map(([idStr, val]) => {
                const shiftId = parseInt(idStr)
                const shift = shifts.find(s => s.id === shiftId)
                const day = shift ? days.find(d => d.dayIndex === shift.day_index) : null
                if (!day) return null
                return (
                  <div key={idStr} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{day.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{day.startTime}–{day.endTime}</div>
                    </div>
                    <input
                      className="modal-input"
                      type="number"
                      min={1}
                      max={50}
                      style={{ width: 70, textAlign: 'center' }}
                      value={val}
                      onChange={e => setOpenWeekSlots(prev => ({ ...prev, [idStr]: e.target.value }))}
                      onBlur={e => {
                        const v = parseInt(e.target.value)
                        setOpenWeekSlots(prev => ({ ...prev, [idStr]: String(isNaN(v) || v < 1 ? 1 : Math.min(50, v)) }))
                      }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 40 }}>platser</span>
                  </div>
                )
              })}
            </div>

            <div className="modal-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => setOpenWeekDialog(false)}>Avbryt</button>
              <button className="btn btn-sm btn-primary" onClick={handleOpenWeek}>Öppna pass</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
