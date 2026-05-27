'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, Plus, Users } from './Icons'
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
  reserves?: number
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
  // inflightRef: number of optimistic mutations currently flying. Polling
  // skips while > 0 so a stale server response doesn't overwrite optimistic
  // state. See withInflight() helper below.
  const inflightRef = useRef(0)

  const [weekOffset, setWeekOffset] = useState(0)
  const [weekYear, setWeekYear] = useState(0)
  const [weekNumber, setWeekNumber] = useState(0)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [days, setDays] = useState<DayInfo[]>([])
  const [local, setLocal] = useState<Shift[]>([])
  const [draftSlots, setDraftSlots] = useState<Record<number, string>>({})
  const [counts, setCounts] = useState<Record<number, { approved: number; pending: number; reserves: number }>>({})
  const [applicantsByShift, setApplicantsByShift] = useState<Record<number, unknown[]>>({})
  const [openShiftId, setOpenShiftId] = useState<number | null>(null)
  const [openWeekDialog, setOpenWeekDialog] = useState(false)
  const [openWeekSlots, setOpenWeekSlots] = useState<Record<number, string>>({})
  // Custom-closed days (sommarstängt, midsommar, jul etc) — keyed by date string
  const [customClosed, setCustomClosed] = useState<Record<string, { reason: string; color: string }>>({})
  const { toast, show: showToast, clear: clearToast } = useToast()

  const load = useCallback(async () => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    const tmp = new Date(base); tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const isoYear = tmp.getFullYear()
    const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
    const cacheKey = `weeks-${isoYear}-${isoWeek}`

    const apply = (data: { weekYear: number; weekNumber: number; shifts: Shift[]; days: DayInfo[]; applicantsByShift?: Record<number, unknown[]> }) => {
      setWeekYear(data.weekYear)
      setWeekNumber(data.weekNumber)
      setShifts(data.shifts)
      setDays(data.days)
      setLocal(data.shifts.map((s: Shift) => ({ ...s })))
      const drafts: Record<number, string> = {}
      data.shifts.forEach((s: Shift) => { drafts[s.id] = String(s.slots) })
      setDraftSlots(drafts)
      const c: Record<number, { approved: number; pending: number; reserves: number }> = {}
      data.shifts.forEach((s: Shift) => {
        c[s.id] = { approved: s.approved ?? 0, pending: s.pending ?? 0, reserves: s.reserves ?? 0 }
      })
      setCounts(c)
      if (data.applicantsByShift) setApplicantsByShift(data.applicantsByShift)
    }

    // SWR: serve cached data immediately if available, then revalidate in background.
    const cached = cache.get(cacheKey)
    if (cached) apply(cached as Parameters<typeof apply>[0])
    isMounted.current = true

    const id = ++loadId.current
    const res = await fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`)
    if (!res.ok) return
    const data = await res.json()
    if (id !== loadId.current) return  // stale

    cache.set(cacheKey, data)
    apply(data)
  }, [weekOffset, cache])

  useEffect(() => { load() }, [weekOffset, load])

  // Load custom-closed days once — used to show why a day is locked and to
  // disable the "open" toggle on those days.
  useEffect(() => {
    const fromCache = cache.get('custom-closed') as { date: string; reason: string; color: string }[] | undefined
    if (fromCache) {
      const map: Record<string, { reason: string; color: string }> = {}
      for (const c of fromCache) map[c.date] = { reason: c.reason, color: c.color }
      setCustomClosed(map)
    }
    fetch('/api/custom-closed')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = (d?.days ?? []) as { date: string; reason: string; color: string }[]
        const map: Record<string, { reason: string; color: string }> = {}
        for (const c of list) map[c.date] = { reason: c.reason, color: c.color }
        setCustomClosed(map)
        cache.set('custom-closed', list)
      })
      .catch(() => {})
  }, [cache])

  // Returns a lock reason for a day, or null if the day can be freely opened/closed.
  const getLockReason = (day: DayInfo): { label: string; detail: string; color?: string } | null => {
    if (day.holiday) {
      return {
        label: day.holiday.type === 'holiday' ? 'Röd dag' : 'Afton',
        detail: day.holiday.name,
      }
    }
    const cc = customClosed[day.date]
    if (cc) return { label: 'Stängd', detail: cc.reason, color: cc.color }
    return null
  }

  // Lightweight refresh — only updates counts + applicantsByShift, leaves
  // shifts/draft slot edits alone. Used both by polling and after admin actions
  // so the day cards' "X väntar" badges stay in sync without re-rendering the
  // whole week.
  const refreshCounts = useCallback(async () => {
    const base = new Date()
    base.setDate(base.getDate() + weekOffset * 7)
    const tmp = new Date(base); tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const isoYear = tmp.getFullYear()
    const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
    try {
      const res = await fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`)
      if (!res.ok) return
      const data = await res.json()
      const c: Record<number, { approved: number; pending: number; reserves: number }> = {}
      ;(data.shifts as Shift[]).forEach(s => {
        c[s.id] = { approved: s.approved ?? 0, pending: s.pending ?? 0, reserves: s.reserves ?? 0 }
      })
      setCounts(c)
      if (data.applicantsByShift) setApplicantsByShift(data.applicantsByShift)
      cache.set(`weeks-${isoYear}-${isoWeek}`, data)
    } catch {}
  }, [weekOffset, cache])

  // Live updates: poll the current week every 8s so counts reflect new
  // applications in near real-time. Pauses while the InterestPanel is open
  // OR while an optimistic mutation is in-flight so a stale server response
  // doesn't overwrite optimistic state.
  useEffect(() => {
    if (openShiftId !== null) return
    const refresh = () => {
      if (document.hidden) return
      if (inflightRef.current > 0) return
      refreshCounts()
    }
    const interval = setInterval(refresh, 8000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refresh) }
  }, [refreshCounts, openShiftId])

  // Helper: wrap an async optimistic action so the polling pause covers it.
  // Counter-based (not boolean) so concurrent mutations all properly hold the gate.
  const withInflight = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    inflightRef.current++
    try { return await fn() }
    finally { inflightRef.current = Math.max(0, inflightRef.current - 1) }
  }, [])

  // Prefetch adjacent weeks for instant navigation
  useEffect(() => {
    const prefetch = (offset: number) => {
      const base = new Date()
      base.setDate(base.getDate() + offset * 7)
      const tmp = new Date(base); tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
      const isoYear = tmp.getFullYear()
      const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
      const key = `weeks-${isoYear}-${isoWeek}`
      if (cache.get(key)) return
      fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) cache.set(key, data) })
        .catch(() => {})
    }
    const t = setTimeout(() => {
      prefetch(weekOffset - 1)
      prefetch(weekOffset + 1)
    }, 300)
    return () => clearTimeout(t)
  }, [weekOffset, cache])

  const update = async (id: number, field: 'is_open' | 'slots', value: number) => {
    const currentShift = local.find(s => s.id === id)
    if (!currentShift) return
    // Block opening a day that's locked by holiday/eve/custom-closed
    const day = days.find(d => d.dayIndex === currentShift.day_index)
    if (day && field === 'is_open' && value === 1 && getLockReason(day)) {
      const reason = getLockReason(day)!
      showToast(`Den här dagen kan inte öppnas — ${reason.label.toLowerCase()} (${reason.detail}).`, 'error')
      return
    }
    const updatedShift = { ...currentShift, [field]: value }
    setLocal(prev => prev.map(s => s.id === id ? updatedShift : s))
    if (field === 'slots') setDraftSlots(prev => ({ ...prev, [id]: String(value) }))
    const res = await fetch('/api/shifts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: updatedShift.id, is_open: updatedShift.is_open, slots: updatedShift.slots }]),
    })
    if (res.ok) showToast('Autosparad')
    else showToast('Fel vid sparande', 'error')
  }

  // --- Optimistic helpers for admin actions inside InterestPanel ---
  // counts in WeekConfig are what drive the day-card badges ("3 väntar" etc.).
  // The panel handles its own applicants state; we mirror the mutation onto
  // applicantsByShift so reopening the panel doesn't show stale data, and we
  // recompute the day-card count from the mutated applicant list.

  type Mutable = {
    id: number
    approved: boolean | number
    rejected: number
    withdrawn: number
    reserve: number
    [key: string]: unknown
  }

  const computeCounts = (apps: Mutable[]) => {
    let approved = 0, pending = 0, reserves = 0
    for (const a of apps) {
      const isApproved = Boolean(a.approved)
      if (isApproved) approved++
      if (a.rejected === 0 && a.withdrawn === 0 && a.reserve === 0 && !isApproved) pending++
      if (a.reserve === 1 && a.rejected === 0 && a.withdrawn === 0) reserves++
    }
    return { approved, pending, reserves }
  }

  // Apply a per-applicant mutation; returns null to delete the applicant.
  const applyAppMutation = async (
    appId: number,
    mutator: (a: Mutable) => Mutable | null,
    fetcher: () => Promise<Response>,
    successToast?: string,
    errorToast = 'Något gick fel.',
  ) => {
    // Locate which shift this applicant belongs to.
    let foundShiftId: number | null = null
    for (const [sidStr, list] of Object.entries(applicantsByShift)) {
      if ((list as Mutable[]).some(a => a.id === appId)) { foundShiftId = Number(sidStr); break }
    }

    const snapCounts = counts
    const snapApps = applicantsByShift

    if (foundShiftId !== null) {
      const shiftId = foundShiftId
      const nextList = (applicantsByShift[shiftId] as Mutable[])
        .map(a => a.id === appId ? mutator(a) : a)
        .filter((a): a is Mutable => a !== null)
      setApplicantsByShift(prev => ({ ...prev, [shiftId]: nextList }))
      setCounts(prev => ({ ...prev, [shiftId]: computeCounts(nextList) }))
    }

    return withInflight(async () => {
      try {
        const res = await fetcher()
        if (!res.ok) throw new Error('action failed')
        if (successToast) showToast(successToast)
        refreshCounts()
      } catch (err) {
        setCounts(snapCounts)
        setApplicantsByShift(snapApps)
        showToast(errorToast, 'error')
        throw err
      }
    })
  }

  const handleApprove = (appId: number) => applyAppMutation(
    appId,
    a => ({ ...a, approved: true, withdrawn: 0 }),
    () => fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: appId }),
    }),
    'Chaufför godkänd. SMS skickat.',
    'Fel vid godkännande.',
  )

  const handleUnapprove = (appId: number, reason?: string) => applyAppMutation(
    appId,
    a => ({ ...a, approved: false, withdrawn: 1, withdrawal_reason: reason ?? null }),
    () => fetch(`/api/approvals/${appId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
    'Chaufför avbokad.',
  )

  const handleReject = (appId: number, reason?: string) => applyAppMutation(
    appId,
    a => ({ ...a, rejected: 1, rejection_reason: reason ?? null }),
    () => fetch(`/api/applications/${appId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
    'Ansökan nekad.',
    'Fel vid nekande.',
  )

  const handleUnreject = (appId: number) => applyAppMutation(
    appId,
    a => ({ ...a, rejected: 0, rejection_reason: null }),
    () => fetch(`/api/applications/${appId}/reject`, { method: 'DELETE' }),
  )

  const handleUnwithdraw = (appId: number) => applyAppMutation(
    appId,
    a => ({ ...a, withdrawn: 0, withdrawal_reason: null }),
    () => fetch(`/api/applications/${appId}/withdraw`, { method: 'DELETE' }),
  )

  const handleDeleteApplication = (appId: number) => applyAppMutation(
    appId,
    () => null,
    () => fetch(`/api/applications/${appId}`, { method: 'DELETE' }),
    undefined,
    'Fel vid borttagning.',
  )

  const handlePromoteReserve = (appId: number) => applyAppMutation(
    appId,
    a => ({ ...a, reserve: 0, approved: true }),
    () => fetch(`/api/applications/${appId}/promote`, { method: 'POST' }),
    'Reserv bokad in.',
    'Fel vid uppflyttning.',
  )

  const handleMoveToReserve = (appId: number) => applyAppMutation(
    appId,
    a => ({ ...a, reserve: 1, approved: false }),
    () => fetch(`/api/applications/${appId}/reserve`, { method: 'POST' }),
    'Flyttad till reservlistan.',
    'Fel vid flytt till reserv.',
  )

  // Book driver: we don't have the new applicant's full data upfront, so we
  // optimistically bump the approved count for the badge and let refreshCounts
  // sync applicantsByShift in the background.
  const handleBookDriver = async (shiftId: number, userId: string) => {
    const snapCounts = counts
    setCounts(prev => ({
      ...prev,
      [shiftId]: {
        approved: (prev[shiftId]?.approved ?? 0) + 1,
        pending: prev[shiftId]?.pending ?? 0,
        reserves: prev[shiftId]?.reserves ?? 0,
      },
    }))

    return withInflight(async () => {
      try {
        const res = await fetch(`/api/shifts/${shiftId}/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
        if (!res.ok) throw new Error('book failed')
        showToast('Chaufför bokad. SMS skickat.')
        refreshCounts()
      } catch (err) {
        setCounts(snapCounts)
        showToast('Fel vid bokning.', 'error')
        throw err
      }
    })
  }

  const handleUpdateSlots = async (shiftId: number, slots: number) => {
    // Optimistic — update local state instantly, no full week reload.
    const prevLocal = local
    const prevShifts = shifts
    const prevDrafts = draftSlots
    setLocal(prev => prev.map(s => s.id === shiftId ? { ...s, slots } : s))
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, slots } : s))
    setDraftSlots(prev => ({ ...prev, [shiftId]: String(slots) }))

    await withInflight(async () => {
      try {
        const res = await fetch('/api/shifts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ id: shiftId, slots }]),
        })
        if (!res.ok) throw new Error('update slots failed')
        // Background refresh in case slot change cascades (long-term bookings etc).
        refreshCounts()
      } catch {
        setLocal(prevLocal)
        setShifts(prevShifts)
        setDraftSlots(prevDrafts)
        showToast('Kunde inte uppdatera platser.', 'error')
      }
    })
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

    // Optimistic UI: close dialog, apply changes locally, show toast immediately.
    // The user gets instant feedback while the request + revalidation flies off.
    const updateMap = new Map(updates.map(u => [u.id, u]))
    const previousLocal = local
    const previousShifts = shifts
    const previousDrafts = draftSlots
    setLocal(prev => prev.map(s => {
      const u = updateMap.get(s.id)
      return u ? { ...s, is_open: 1, slots: u.slots } : s
    }))
    setShifts(prev => prev.map(s => {
      const u = updateMap.get(s.id)
      return u ? { ...s, is_open: 1, slots: u.slots } : s
    }))
    setDraftSlots(prev => {
      const next = { ...prev }
      for (const u of updates) next[u.id] = String(u.slots)
      return next
    })
    setOpenWeekDialog(false)
    showToast(`${updates.length} pass öppnade.`)

    // Fire-and-forget under inflight gate so polling doesn't race the response.
    withInflight(async () => {
      try {
        const res = await fetch('/api/shifts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        if (!res.ok) throw new Error('open week failed')
        refreshCounts()
      } catch {
        setLocal(previousLocal)
        setShifts(previousShifts)
        setDraftSlots(previousDrafts)
        showToast('Fel vid öppning. Försök igen.', 'error')
      }
    })
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
              // Skip past days, holidays/eves, and custom-closed days
              return d && d.date >= todayStr && !d.holiday && !customClosed[d.date]
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
          const lock = getLockReason(day)
          const isLocked = lock !== null

          return (
            <div
              key={day.dayIndex}
              className={`cfg-card ${isOpen ? 'is-open' : 'is-closed'} ${isLocked ? 'is-locked' : ''}`}
            >
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

              {/* Lock reason banner — shown when day cannot be opened */}
              {isLocked && (
                <div
                  className={`cfg-lock-banner ${day.holiday?.type === 'eve' ? 'eve' : day.holiday ? 'holiday' : 'custom'}`}
                  style={lock.color && !day.holiday ? { borderLeftColor: lock.color } : undefined}
                >
                  <div className="cfg-lock-label">{lock.label}</div>
                  <div className="cfg-lock-detail">{lock.detail}</div>
                </div>
              )}

              {/* Applicants button */}
              {(() => {
                const c            = counts[shift.id] ?? { approved: 0, pending: 0, reserves: 0 }
                const isOverbooked = isOpen && c.approved > shift.slots
                const isFull       = isOpen && c.approved >= shift.slots
                return (
                  <button
                    className={`cfg-applicants-btn ${isOverbooked ? 'is-overbooked' : ''}`}
                    onClick={() => setOpenShiftId(shift.id)}
                    type="button"
                  >
                    <Users className="svg-ico svg-ico-sm" />
                    <span>{c.approved} godkända</span>
                    {isOverbooked
                      ? <span className="cfg-overbooked-tag">+{c.approved - shift.slots} över</span>
                      : isFull
                        ? <span className="cfg-full-tag">Fullbokad</span>
                        : null
                    }
                    {c.pending > 0 && <span className="badge b-pending" style={{ fontSize: 11 }}><span className="pip" />{c.pending} väntar</span>}
                    {c.reserves > 0 && <span className="cfg-reserve-count">{c.reserves} res.</span>}
                  </button>
                )
              })()}

              <div className="cfg-field">
                <label>Öppen för anmälan</label>
                <div
                  className={`tg ${isOpen ? 'on' : ''} ${isLocked ? 'tg-locked' : ''}`}
                  onClick={() => {
                    if (isLocked) {
                      showToast(`Den här dagen kan inte öppnas — ${lock.label.toLowerCase()} (${lock.detail}).`, 'error')
                      return
                    }
                    update(shift.id, 'is_open', isOpen ? 0 : 1)
                  }}
                  role="switch"
                  aria-checked={isOpen}
                  aria-disabled={isLocked}
                  title={isLocked ? `Låst — ${lock.label}: ${lock.detail}` : undefined}
                />
              </div>

              <div className="cfg-field">
                <label>Antal platser</label>
                <div className="num-input">
                  <button disabled={!isOpen || isLocked} onClick={() => update(shift.id, 'slots', Math.max(1, shift.slots - 1))}>
                    −
                  </button>
                  <input
                    type="number"
                    value={draftSlots[shift.id] ?? shift.slots}
                    min={1}
                    max={50}
                    disabled={!isOpen || isLocked}
                    style={{ opacity: (!isOpen || isLocked) ? 0.5 : 1 }}
                    onChange={e => setDraftSlots(prev => ({ ...prev, [shift.id]: e.target.value }))}
                    onBlur={e => {
                      const val = parseInt(e.target.value)
                      const clamped = isNaN(val) || val < 1 ? 1 : Math.min(50, val)
                      update(shift.id, 'slots', clamped)
                    }}
                  />
                  <button disabled={!isOpen || isLocked} onClick={() => update(shift.id, 'slots', Math.min(50, shift.slots + 1))}>
                    +
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <InterestPanel
        open={openShiftId !== null}
        shift={shifts.find(s => s.id === openShiftId) ?? null}
        dayLabel={days.find(d => d.dayIndex === (shifts.find(s => s.id === openShiftId)?.day_index))?.label ?? ''}
        onClose={() => setOpenShiftId(null)}
        onApprove={handleApprove}
        onUnapprove={handleUnapprove}
        onUpdateSlots={handleUpdateSlots}
        onBookDriver={handleBookDriver}
        onReject={handleReject}
        onUnreject={handleUnreject}
        onUnwithdraw={handleUnwithdraw}
        onDeleteApplication={handleDeleteApplication}
        onPromoteReserve={handlePromoteReserve}
        onMoveToReserve={handleMoveToReserve}
        initialApplicants={openShiftId !== null ? applicantsByShift[openShiftId] : undefined}
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
