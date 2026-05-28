'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useUser, useSignOut } from '@/lib/supabase/use-user'
import { Clock, Check, Home, Settings, User, LogOut, ChevronLeft, ChevronRight } from './Icons'
import { Toast, useToast } from './Toast'
import { PushNudge } from './PushNudge'
import { CurrentWeekBadge } from './CurrentWeekBadge'

interface ShiftDay {
  shift: { id: number; is_open: number; slots: number; day_index: number; date: string } | null
  dayIndex: number
  date: string
  label: string
  shortLabel: string
  startTime: string
  endTime: string
  holiday: { name: string; type: 'holiday' | 'eve' } | null
}
interface Application {
  id: number
  shift_id: number
  approved: boolean
  rejected: boolean
  rejection_reason: string | null
  withdrawn: boolean
  reserve: number
  applied_at: string
  // From /api/applications/mine (forUser). Optional because optimistic
  // entries built locally don't have shift metadata yet.
  shift_date?: string
  shift_day_index?: number
}

function dayLabelFromIndex(idx?: number) {
  if (idx === undefined) return ''
  return ['Mån','Tis','Ons','Tors','Fre','Lör','Sön'][idx] ?? ''
}
interface WeekData {
  weekYear: number
  weekNumber: number
  shifts: { id: number; day_index: number; date: string; is_open: number; slots: number; approved?: number; pending?: number }[]
  days: { dayIndex: number; date: string; label: string; shortLabel: string; startTime: string; endTime: string; holiday: { name: string; type: 'holiday' | 'eve' } | null }[]
}

function fmt(dateStr: string) {
  const months = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

type DayStatus = 'closed' | 'confirmed' | 'pending' | 'rejected' | 'withdrawn' | 'full' | 'open' | 'reserve'

function statusFor(shift: ShiftDay['shift'], app?: Application, approvedCount = 0): DayStatus {
  if (!shift || !shift.is_open) return 'closed'
  if (app?.approved) return 'confirmed'
  if (app?.rejected) return 'rejected'
  if (app?.withdrawn) return 'withdrawn'
  if (app?.reserve === 1) return 'reserve'
  if (app) return 'pending'
  if (approvedCount >= shift.slots) return 'full'
  return 'open'
}

export function DriverHome() {
  const authUser = useUser()
  const signOut = useSignOut()
  const [isDesktop, setIsDesktop] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekData, setWeekData] = useState<WeekData | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [allApprovedCounts, setAllApprovedCounts] = useState<Record<number, number>>({})
  const [role, setRole] = useState<'driver' | 'admin' | null>(null)
  const [consecutiveWarning, setConsecutiveWarning] = useState<{ shiftId: number; count: number } | null>(null)
  const { toast, show: showToast, clear: clearToast } = useToast()
  // Augment auth user with role from our users table (Supabase auth doesn't store it).
  const user = authUser ? { ...authUser, role } : null

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Fetch our role from the database — Supabase Auth alone doesn't carry it.
  useEffect(() => {
    if (!authUser) return
    fetch('/api/users/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.role) setRole(d.role) })
      .catch(() => {})
  }, [authUser])

  // Helper: derive ISO year + week from an offset (weeks from today)
  const isoFromOffset = (offset: number) => {
    const target = new Date()
    target.setDate(target.getDate() + offset * 7)
    const tmp = new Date(target)
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const isoYear = tmp.getFullYear()
    const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
    return { isoYear, isoWeek }
  }

  // Cache TTL — slightly above the polling interval (10s) so cache from a
  // recent poll is still trusted, but anything older falls through to skeleton
  // + fresh fetch. This avoids painting stale "Sökt" / "Anmäl intresse" state
  // for a moment after refresh when admin already approved/rejected.
  const CACHE_MAX_AGE_MS = 12000

  const loadId = useRef(0)
  const loadWeek = useCallback(async (offset = 0) => {
    const id = ++loadId.current
    const { isoYear, isoWeek } = isoFromOffset(offset)
    const cacheKey = `driver-week-${isoYear}-${isoWeek}`

    // SWR: pull cached data from sessionStorage so the UI renders the new
    // week instantly. Skip if older than CACHE_MAX_AGE_MS so we don't paint
    // a stale status (e.g. "Sökt" when the admin has since approved).
    let hasCache = false
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(cacheKey)
        if (raw) {
          const parsed = JSON.parse(raw) as { week?: WeekData; apps?: Application[]; ts?: number }
          const fresh = typeof parsed.ts === 'number' && (Date.now() - parsed.ts) < CACHE_MAX_AGE_MS
          if (fresh && parsed.week) {
            setWeekData(parsed.week)
            const counts: Record<number, number> = {}
            for (const s of parsed.week.shifts) counts[s.id] = s.approved ?? 0
            setAllApprovedCounts(counts)
            if (parsed.apps) setApplications(parsed.apps)
            hasCache = true
          }
        }
      } catch {}
    }

    // If no fresh cache, blank out previous week's data so we show the skeleton
    // instead of stale shifts.
    if (!hasCache) setWeekData(null)

    // Parallel fetch of week + user's applications
    const [res, appRes] = await Promise.all([
      fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`),
      fetch('/api/applications/mine'),
    ])
    if (id !== loadId.current) return // stale — newer week clicked
    if (!res.ok) return

    // Parse BOTH bodies up front so we can apply weekData + applications in
    // the same synchronous tick. If we set weekData first and then awaited
    // appRes.json(), React would render once with new shifts but stale (empty)
    // applications — causing a brief flash of "Anmäl intresse" on already-
    // confirmed days after a hard refresh.
    const [data, apps] = await Promise.all([
      res.json() as Promise<WeekData>,
      appRes.ok ? (appRes.json() as Promise<Application[]>) : Promise.resolve(null),
    ])
    if (id !== loadId.current) return

    const counts: Record<number, number> = {}
    for (const shift of data.shifts) counts[shift.id] = shift.approved ?? 0

    // Set together — React 18 batches these into one render.
    setWeekData(data)
    if (apps) setApplications(apps)
    setAllApprovedCounts(counts)

    if (typeof window !== 'undefined') {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ week: data, apps, ts: Date.now() })) } catch {}
    }
  }, [])

  useEffect(() => { loadWeek(weekOffset) }, [weekOffset, loadWeek])

  // --- Live updates ---
  // Poll my applications (+ current week's approved counts) every 10s so the
  // driver sees approvals/rejections/withdrawals the moment trafikledningen
  // makes them — no manual refresh needed. Pauses on hidden tabs and while an
  // optimistic mutation is in flight so we don't overwrite local state with
  // a stale snapshot.
  const inflightRef = useRef(0)
  // Monotonically decreasing id for optimistic entries. A counter (not
  // Date.now()) guarantees uniqueness even on rapid double-taps within the
  // same millisecond.
  const tempIdRef = useRef(-1)
  const withInflight = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    inflightRef.current++
    try { return await fn() }
    finally { inflightRef.current = Math.max(0, inflightRef.current - 1) }
  }, [])

  const liveTick = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (inflightRef.current > 0) return
    const { isoYear, isoWeek } = isoFromOffset(weekOffset)
    try {
      const [weekRes, appRes] = await Promise.all([
        fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`),
        fetch('/api/applications/mine'),
      ])
      // Re-check inflight after the await — a mutation may have started while
      // we were fetching; if so, drop this snapshot rather than overwrite it.
      if (inflightRef.current > 0) return

      // Parse both bodies together so we can apply state in one tick — avoids
      // a momentary mismatch between fresh shifts and stale applications.
      const [data, next] = await Promise.all([
        weekRes.ok ? (weekRes.json() as Promise<WeekData>) : Promise.resolve(null),
        appRes.ok ? (appRes.json() as Promise<Application[]>) : Promise.resolve(null),
      ])
      if (inflightRef.current > 0) return

      if (data) {
        const counts: Record<number, number> = {}
        for (const s of data.shifts) counts[s.id] = s.approved ?? 0
        setAllApprovedCounts(counts)
        setWeekData(prev => prev ? { ...prev, shifts: data.shifts, days: data.days } : data)
      }
      if (next) {
        setApplications(prev => {
          // Detect status transitions on apps that already existed locally,
          // toast the meaningful ones.
          const prevById = new Map(prev.map(a => [a.id, a]))
          for (const n of next) {
            const p = prevById.get(n.id)
            if (!p) continue
            const dayName = dayLabelFromIndex(n.shift_day_index)
            const dateLabel = n.shift_date ? fmt(n.shift_date) : ''
            const when = dayName && dateLabel ? `${dayName} ${dateLabel}` : dayName || dateLabel
            const suffix = when ? ` (${when})` : ''
            // pending → approved
            if (!p.approved && n.approved && !p.rejected && !n.rejected) {
              showToast(`Ditt pass${suffix} är godkänt! 🎉`)
            }
            // pending/approved → rejected
            else if (!p.rejected && n.rejected) {
              showToast(`Ditt pass${suffix} nekades.`, 'error')
            }
            // approved → withdrawn (admin removed approval)
            else if (p.approved && !n.approved && n.withdrawn) {
              showToast(`Trafikledning avbokade ditt pass${suffix}.`, 'error')
            }
            // reserve → approved (promoted)
            else if (p.reserve === 1 && n.approved && !n.reserve) {
              showToast(`Du har blivit uppflyttad från reserv${suffix}! 🎉`)
            }
          }
          // Preserve any optimistic temp entries (negative ids) that the
          // server doesn't know about yet (no matching shift_id in `next`).
          const tempEntries = prev.filter(a => a.id < 0 && !next.some(n => n.shift_id === a.shift_id))
          return [...next, ...tempEntries]
        })
      }

      // Keep the SWR cache fresh so a refresh between ticks doesn't paint
      // stale status. Only writes when we have data for the current week.
      if (data && next && typeof window !== 'undefined') {
        try {
          const cacheKey = `driver-week-${isoYear}-${isoWeek}`
          sessionStorage.setItem(cacheKey, JSON.stringify({ week: data, apps: next, ts: Date.now() }))
        } catch {}
      }
    } catch {
      // Network blip — just try again next tick.
    }
  }, [weekOffset, showToast])

  useEffect(() => {
    const interval = setInterval(liveTick, 10000)
    const onVisible = () => { if (!document.hidden) liveTick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [liveTick])

  // Prefetch adjacent weeks in the background so prev/next clicks feel instant.
  useEffect(() => {
    const prefetch = (offset: number) => {
      const { isoYear, isoWeek } = isoFromOffset(offset)
      const key = `driver-week-${isoYear}-${isoWeek}`
      if (typeof window === 'undefined') return
      // Skip if we have a still-fresh prefetch for this week.
      const existing = sessionStorage.getItem(key)
      if (existing) {
        try {
          const parsed = JSON.parse(existing) as { ts?: number }
          if (typeof parsed.ts === 'number' && (Date.now() - parsed.ts) < CACHE_MAX_AGE_MS) return
        } catch {}
      }
      Promise.all([
        fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`).then(r => r.ok ? r.json() : null),
        fetch('/api/applications/mine').then(r => r.ok ? r.json() : null),
      ]).then(([week, apps]) => {
        if (week) {
          try { sessionStorage.setItem(key, JSON.stringify({ week, apps, ts: Date.now() })) } catch {}
        }
      }).catch(() => {})
    }
    prefetch(weekOffset - 1)
    prefetch(weekOffset + 1)
    prefetch(weekOffset + 2)
  }, [weekOffset])

  const handleApplyReserve = async (shiftId: number) => {
    // Guard against double-submit: bail if an active application already exists.
    if (applications.some(a => a.shift_id === shiftId && !a.rejected && !a.withdrawn)) return
    const tempId = tempIdRef.current--
    const optimisticApp: Application = {
      id: tempId, shift_id: shiftId,
      approved: false, rejected: false, rejection_reason: null,
      withdrawn: false, reserve: 1, applied_at: new Date().toISOString(),
    }
    setApplications(prev => [...prev, optimisticApp])
    showToast('Du är tillagd på reservlistan!')

    await withInflight(async () => {
      try {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shiftId, reserve: true }),
        })
        // 409 = already on the list (e.g. another device). Treat as success —
        // the next poll reconciles the temp entry with the real one.
        if (res.status === 409) return
        if (!res.ok) throw new Error('reserve failed')
        const data = await res.json()
        setApplications(prev => prev.map(a => a.id === tempId ? { ...optimisticApp, id: data.id ?? tempId } : a))
      } catch {
        setApplications(prev => prev.filter(a => a.id !== tempId))
        clearToast()
        showToast('Något gick fel.', 'error')
      }
    })
  }

  const handleApply = async (shiftId: number, force = false) => {
    // Guard against double-submit: bail if an active application already exists.
    // (Skipped implicitly on the force path — the optimistic entry was removed
    // when the consecutive-days warning was shown.)
    if (applications.some(a => a.shift_id === shiftId && !a.rejected && !a.withdrawn)) return
    // Optimistic: add a pending app + show toast immediately so the UI reacts
    // instantly. If the server flags a consecutive-days warning we dismiss the
    // toast and surface the modal instead.
    const tempId = tempIdRef.current--
    const optimisticApp: Application = {
      id: tempId,
      shift_id: shiftId,
      approved: false,
      rejected: false,
      rejection_reason: null,
      withdrawn: false,
      reserve: 0,
      applied_at: new Date().toISOString(),
    }
    setApplications(prev => [...prev, optimisticApp])
    showToast('Intresseanmälan skickad!')

    await withInflight(async () => {
      try {
        const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shiftId, force }),
        })
        // 409 = already applied (e.g. another device/tab). Treat as success —
        // the next poll reconciles the temp entry with the real one.
        if (res.status === 409) return
        if (!res.ok) throw new Error('apply failed')
        const data = await res.json()

        if (data.warning === 'CONSECUTIVE_DAYS') {
          // Warning needs confirmation — revert optimistic and pull back the toast.
          setApplications(prev => prev.filter(a => a.id !== tempId))
          clearToast()
          setConsecutiveWarning({ shiftId, count: data.count })
          return
        }
        // Replace temp with real id
        setApplications(prev => prev.map(a => a.id === tempId ? { ...optimisticApp, id: data.id ?? tempId } : a))
      } catch {
        setApplications(prev => prev.filter(a => a.id !== tempId))
        clearToast()
        showToast('Något gick fel.', 'error')
      }
    })
  }

  const handleWithdraw = async (appId: number) => {
    // Optimistic: remove from local state + show toast instantly
    const previous = applications
    setApplications(prev => prev.filter(a => a.id !== appId))
    showToast('Anmälan återkallad.')

    await withInflight(async () => {
      try {
        const res = await fetch(`/api/applications/${appId}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setApplications(previous)
          clearToast()
          if (data.error === 'ALREADY_APPROVED') showToast('Du är redan godkänd — kontakta trafikledningen.', 'error')
          else showToast('Något gick fel.', 'error')
        }
      } catch {
        setApplications(previous)
        clearToast()
        showToast('Något gick fel.', 'error')
      }
    })
  }

  if (!weekData) {
    return <DriverSkeleton isDesktop={isDesktop} userName={user?.name ?? null} />
  }

  const days: ShiftDay[] = weekData.days.map(d => ({
    ...d,
    shift: weekData.shifts.find(s => s.day_index === d.dayIndex) ?? null,
  }))

  const myApps: Record<number, Application> = {}
  for (const app of applications) {
    if (weekData.shifts.some(s => s.id === app.shift_id)) {
      myApps[app.shift_id] = app
    }
  }

  const confirmedThisWeek = days.filter(d => d.shift && myApps[d.shift.id]?.approved)
  const pendingThisWeek = days.filter(d => {
    if (!d.shift) return false
    const app = myApps[d.shift.id]
    return app && !app.approved && !app.rejected && !app.withdrawn
  })

  // Confirmed pass for the week currently being viewed. Each week should be
  // self-contained — a confirmation from an earlier/later week shouldn't bump
  // this week's count or appear here. We use shift_date (returned by
  // /api/applications/mine) and the dates of the viewed week to scope.
  const weekDateSet = new Set(weekData.days.map(d => d.date))
  const confirmedThisWeekApps = applications.filter(a =>
    a.approved && a.shift_date && weekDateSet.has(a.shift_date)
  )

  if (isDesktop) {
    return (
      <div className="driver-shell desktop">
        <div className="driver-desktop">
          {/* Desktop header */}
          <div className="driver-desktop-header">
            <div className="brand">
              <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
              <div>
                <div className="name">Passbokning</div>
                <div className="sub">Chaufför · Mina pass</div>
              </div>
            </div>
            <div className="right">
              <CurrentWeekBadge />
              <Link href="/profile" prefetch className="driver-profile-link" title="Min profil">
                <div style={{ textAlign: 'right' }}>
                  <div className="who">{user?.name}</div>
                  <div className="role">{user?.role === 'admin' ? 'Trafikledare' : 'Chaufför'}</div>
                </div>
                <div className="avatar">{initials(user?.name)}</div>
              </Link>
              {user?.role === 'admin' && (
                <Link href="/admin" prefetch className="btn btn-sm">Adminvy</Link>
              )}
              <button className="btn-ghost btn btn-icon" onClick={signOut}>
                <LogOut className="svg-ico" />
              </button>
            </div>
          </div>

          <PushNudge />

          {/* KPI strip */}
          <div className="driver-summary">
            <div className="driver-stat">
              <div className="label">Vecka</div>
              <div className="value">{weekData.weekNumber}<span className="unit">/ {weekData.weekYear}</span></div>
            </div>
            <div className="driver-stat">
              <div className="label">Bekräftade pass</div>
              <div className="value">{confirmedThisWeek.length}<span className="unit">denna vecka</span></div>
            </div>
            <div className="driver-stat">
              <div className="label">Väntar svar</div>
              <div className="value">{pendingThisWeek.length}</div>
            </div>
          </div>

          {/* Days grid */}
          <div className="section-h" style={{ marginTop: 28 }}>
            <span className="t">
              <button className="arrow" onClick={() => setWeekOffset(o => o - 1)} style={{ marginRight: 4 }}><ChevronLeft className="svg-ico" /></button>
              Vecka {weekData.weekNumber} · {weekData.weekYear}
              <button className="arrow" onClick={() => setWeekOffset(o => o + 1)} style={{ marginLeft: 4 }}><ChevronRight className="svg-ico" /></button>
            </span>
            {weekOffset !== 0 && (
              <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => setWeekOffset(0)}>Idag</button>
            )}
          </div>
          <div className="driver-grid">
            {days.map(d => (
              <DayCard key={d.dayIndex} day={d} app={myApps[d.shift?.id ?? -1]} approvedCount={allApprovedCounts[d.shift?.id ?? -1] ?? 0} onApply={handleApply} onWithdraw={handleWithdraw} onApplyReserve={handleApplyReserve} />
            ))}
          </div>

          {/* Confirmed strip — scoped to the week being viewed */}
          <div className="section-h">
            <span className="t">Mina bekräftade pass denna vecka</span>
            <span className="count">{confirmedThisWeekApps.length} st</span>
          </div>
          {confirmedThisWeekApps.length === 0
            ? <div className="empty-state">Inga bekräftade pass denna vecka.</div>
            : <div className="confirmed-strip">
                {confirmedThisWeekApps.map(a => (
                  <ConfirmedRow key={a.id} app={a} shifts={weekData.shifts} days={weekData.days} />
                ))}
              </div>
          }
        </div>
        <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
        {consecutiveWarning && <ConsecutiveWarning count={consecutiveWarning.count} onConfirm={() => { const id = consecutiveWarning.shiftId; setConsecutiveWarning(null); handleApply(id, true) }} onCancel={() => setConsecutiveWarning(null)} />}
      </div>
    )
  }

  // Mobile layout
  return (
    <div className="driver-shell">
      <div className="driver-frame">
        <div className="driver-header">
          <div>
            <div className="title">Passbokning</div>
            <div className="who">{user?.name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CurrentWeekBadge />
            <button className="btn-ghost btn btn-icon" onClick={signOut}>
              <LogOut className="svg-ico" />
            </button>
          </div>
        </div>

        <div className="driver-body">
          <PushNudge />
          <div className="section-h">
            <span className="t" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="arrow" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft className="svg-ico" /></button>
              Vecka {weekData.weekNumber} · {weekData.weekYear}
              <button className="arrow" onClick={() => setWeekOffset(o => o + 1)}><ChevronRight className="svg-ico" /></button>
            </span>
            {weekOffset !== 0 && (
              <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={() => setWeekOffset(0)}>Idag</button>
            )}
          </div>

          {days.map(d => (
            <DayCard key={d.dayIndex} day={d} app={myApps[d.shift?.id ?? -1]} approvedCount={allApprovedCounts[d.shift?.id ?? -1] ?? 0} onApply={handleApply} onWithdraw={handleWithdraw} onApplyReserve={handleApplyReserve} />
          ))}

          <div className="section-h">
            <span className="t">Mina bekräftade pass denna vecka</span>
            <span className="count">{confirmedThisWeekApps.length}</span>
          </div>
          {confirmedThisWeekApps.length === 0
            ? <div className="empty-state">Inga bekräftade pass denna vecka.</div>
            : confirmedThisWeekApps.map(a => <ConfirmedRow key={a.id} app={a} shifts={weekData.shifts} days={weekData.days} />)
          }
        </div>

        {/* Tab bar */}
        <nav className="tabbar">
          <button className="tab active">
            <Home className="svg-ico ico" />
            Pass
          </button>
          {user?.role === 'admin' && (
            <Link href="/admin" prefetch className="tab">
              <Settings className="svg-ico ico" />
              Admin
            </Link>
          )}
          <Link href="/profile" prefetch className="tab">
            <User className="svg-ico ico" />
            Profil
          </Link>
        </nav>
      </div>
      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
      {consecutiveWarning && <ConsecutiveWarning count={consecutiveWarning.count} onConfirm={() => { const id = consecutiveWarning.shiftId; setConsecutiveWarning(null); handleApply(id, true) }} onCancel={() => setConsecutiveWarning(null)} />}
    </div>
  )
}

function DriverSkeleton({ isDesktop, userName }: { isDesktop: boolean; userName: string | null }) {
  // 6 skeleton day-cards (Mon-Sat) matching the real DayCard layout so the
  // page doesn't jump when real data arrives.
  const days = Array.from({ length: 6 })

  const skeletonCard = (i: number) => (
    <div key={i} className="day-card skel-day">
      <div className="day-row1">
        <div>
          <div className="skel skel-line w-60" />
          <div className="skel skel-line w-40 mt-6" />
        </div>
        <div className="skel skel-badge" />
      </div>
      <div className="day-row2">
        <div className="skel skel-line w-80" />
      </div>
      <div className="skel skel-action" />
    </div>
  )

  if (isDesktop) {
    return (
      <div className="driver-shell desktop">
        <div className="driver-desktop">
          <div className="driver-desktop-header">
            <div className="brand">
              <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
              <div>
                <div className="name">Passbokning</div>
                <div className="sub">Chaufför · Mina pass</div>
              </div>
            </div>
            <div className="right">
              <div style={{ textAlign: 'right' }}>
                <div className="who" style={{ minHeight: 16 }}>{userName ?? ''}</div>
                <div className="role">Chaufför</div>
              </div>
              <div className="skel skel-avatar" />
            </div>
          </div>

          <div className="driver-summary">
            {[0,1,2].map(i => (
              <div key={i} className="driver-stat">
                <div className="skel skel-line w-50" />
                <div className="skel skel-line w-30 mt-10" style={{ height: 22 }} />
              </div>
            ))}
          </div>

          <div className="section-h" style={{ marginTop: 28 }}>
            <span className="t"><div className="skel skel-line w-120" style={{ display: 'inline-block', height: 14 }} /></span>
          </div>
          <div className="driver-grid">
            {days.map((_, i) => skeletonCard(i))}
          </div>
        </div>
      </div>
    )
  }

  // Mobile
  return (
    <div className="driver-shell">
      <div className="driver-frame">
        <div className="driver-header">
          <div>
            <div className="title">Passbokning</div>
            <div className="who" style={{ minHeight: 14 }}>{userName ?? ''}</div>
          </div>
          <div className="skel skel-icon-btn" />
        </div>
        <div className="driver-body">
          <div className="section-h">
            <span className="t"><div className="skel skel-line w-120" style={{ display: 'inline-block', height: 14 }} /></span>
          </div>
          {days.map((_, i) => skeletonCard(i))}
        </div>
        <nav className="tabbar">
          <div className="tab"><div className="skel skel-tab-dot" /></div>
          <div className="tab"><div className="skel skel-tab-dot" /></div>
        </nav>
      </div>
    </div>
  )
}

function ConsecutiveWarning({ count, onConfirm, onCancel }: { count: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ color: '#F59E0B' }}>⚠ Obs — många dagar i rad</div>
        <p className="modal-sub">
          Det här passet innebär att du jobbar <strong>{count} dagar i rad</strong>.
          Arbetstidslagen rekommenderar vila efter 5 dagar. Vill du ändå anmäla intresse?
        </p>
        <div className="modal-actions">
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>Avbryt</button>
          <button className="btn btn-sm" style={{ background: '#F59E0B', color: '#000', fontWeight: 600 }} onClick={onConfirm}>
            Anmäl ändå
          </button>
        </div>
      </div>
    </div>
  )
}

function DayCard({ day, app, approvedCount, onApply, onWithdraw, onApplyReserve }: {
  day: ShiftDay
  app?: Application
  approvedCount: number
  onApply: (id: number) => void
  onWithdraw: (appId: number) => void
  onApplyReserve: (id: number) => void
}) {
  const status = statusFor(day.shift, app, approvedCount)
  const isHoliday = status === 'closed' && day.holiday?.type === 'holiday'
  const isEve     = status === 'closed' && day.holiday?.type === 'eve'
  const cardClass = `day-card is-${status}${isHoliday ? ' is-holiday' : ''}${isEve ? ' is-eve' : ''}`

  const badgeLabel: Record<DayStatus, string> = { closed: 'Stängd', open: 'Öppen', pending: 'Sökt', confirmed: 'Bekräftad', full: 'Fullbokad', rejected: 'Nekad', withdrawn: 'Avbokad', reserve: 'Reserv' }
  const badgeClass: Record<DayStatus, string> = { closed: 'b-closed', open: 'b-open', pending: 'b-pending', confirmed: 'b-confirmed', full: 'b-full', rejected: 'b-rejected', withdrawn: 'b-closed', reserve: 'b-reserve' }

  // Override badge for holidays/eves so the day's nature is the headline,
  // not a generic "Stängd" pill.
  const effectiveBadgeLabel = isHoliday ? 'Röd dag' : isEve ? 'Afton' : badgeLabel[status]
  const effectiveBadgeClass = isHoliday ? 'b-holiday' : isEve ? 'b-eve' : badgeClass[status]

  return (
    <div className={cardClass}>
      <div className="accent-bar" />
      <div className="day-row1">
        <div>
          <div className="day-label">{day.label}</div>
          <div className="day-date">{fmt(day.date)}</div>
        </div>
        <span className={`badge ${effectiveBadgeClass}`}>
          <span className="pip" />{effectiveBadgeLabel}
        </span>
      </div>

      {day.holiday && (isHoliday || isEve) ? (
        <div className={`day-holiday-banner ${isEve ? 'eve' : ''}`}>
          <span className="day-holiday-name">{day.holiday.name}</span>
          <span className="day-holiday-sub">{isHoliday ? 'Inget pass denna dag' : 'Inget pass — afton'}</span>
        </div>
      ) : (
        <div className="day-row2">
          <span className="hours">
            <Clock className="svg-ico svg-ico-sm" />
            {day.startTime}–{day.endTime}
          </span>
        </div>
      )}

      {status === 'open' && day.shift && (
        <button className="day-action is-apply" onClick={() => onApply(day.shift!.id)}>Anmäl intresse</button>
      )}
      {status === 'full' && day.shift && (
        <button className="day-action is-reserve" onClick={() => onApplyReserve(day.shift!.id)}>Anmäl som reserv</button>
      )}
      {status === 'pending' && app && (
        <button className="day-action is-cancel" onClick={() => onWithdraw(app.id)}>Återta anmälan</button>
      )}
      {status === 'reserve' && app && (
        <div className="day-action is-reserve-info">
          <span>Du är på reservlistan</span>
          <button className="day-action-sub-cancel" onClick={() => onWithdraw(app.id)}>Ta bort mig</button>
        </div>
      )}
      {status === 'closed' && !day.holiday && (
        <button className="day-action is-disabled" disabled>Stängd för anmälan</button>
      )}
      {status === 'confirmed' && (
        <button className="day-action is-disabled" disabled>Bekräftad ✓</button>
      )}
      {status === 'rejected' && (
        <div className="day-action is-rejected">
          <span>Nekad</span>
          {app?.rejection_reason && <span className="reject-reason">"{app.rejection_reason}"</span>}
        </div>
      )}
      {status === 'withdrawn' && (
        <div className="day-action is-rejected">
          <span>Avbokad av trafikledning</span>
        </div>
      )}
    </div>
  )
}

function ConfirmedRow({ app, shifts, days }: {
  app: Application
  shifts: WeekData['shifts']
  days: WeekData['days']
}) {
  const shift = shifts.find(s => s.id === app.shift_id)
  const day = shift ? days.find(d => d.dayIndex === shift.day_index) : null
  if (!shift || !day) return null
  const note = 'Vid avbok/sjuk, kontakta trafikledningen.'
  return (
    <div className="confirmed-row">
      <div className="left">
        <div className="check"><Check className="svg-ico svg-ico-sm" /></div>
        <div>
          <div className="date">{day.label} {fmt(shift.date)}</div>
          <div className="hours">{day.startTime}{'–'}{day.endTime}</div>
        </div>
      </div>
      <span className="badge b-confirmed"><span className="pip" />{'Bekräftad'}</span>
      <p className="day-cancel-note">{note}</p>
    </div>
  )
}
