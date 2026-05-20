'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Clock, Check, Home, Settings, User, LogOut, ChevronLeft, ChevronRight } from './Icons'
import { Toast, useToast } from './Toast'

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
  const { data: session } = useSession()
  const router = useRouter()
  const [isDesktop, setIsDesktop] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekData, setWeekData] = useState<WeekData | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [allApprovedCounts, setAllApprovedCounts] = useState<Record<number, number>>({})
  const [consecutiveWarning, setConsecutiveWarning] = useState<{ shiftId: number; count: number } | null>(null)
  const { toast, show: showToast, clear: clearToast } = useToast()
  const user = session?.user

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const loadWeek = useCallback(async (offset = 0) => {
    const now = new Date()
    const target = new Date(now)
    target.setDate(now.getDate() + offset * 7)
    // Compute ISO week year + number
    const tmp = new Date(target)
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const isoYear = tmp.getFullYear()
    const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
    // Parallel fetch of week + user's applications
    const [res, appRes] = await Promise.all([
      fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`),
      fetch('/api/applications/mine'),
    ])
    if (!res.ok) return
    const data: WeekData = await res.json()
    setWeekData(data)
    if (appRes.ok) {
      const apps: Application[] = await appRes.json()
      setApplications(apps)
    }

    // Counts now come inline from /api/weeks
    const counts: Record<number, number> = {}
    for (const shift of data.shifts) {
      counts[shift.id] = shift.approved ?? 0
    }
    setAllApprovedCounts(counts)
  }, [])

  useEffect(() => { loadWeek(weekOffset) }, [weekOffset, loadWeek])

  const handleApplyReserve = async (shiftId: number) => {
    const tempId = -Date.now()
    const optimisticApp: Application = {
      id: tempId, shift_id: shiftId,
      approved: false, rejected: false, rejection_reason: null,
      withdrawn: false, reserve: 1, applied_at: new Date().toISOString(),
    }
    setApplications(prev => [...prev, optimisticApp])
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftId, reserve: true }),
    })
    const data = await res.json()
    if (res.ok) {
      setApplications(prev => prev.map(a => a.id === tempId ? { ...optimisticApp, id: data.id ?? tempId } : a))
      showToast('Du är tillagd på reservlistan!')
    } else {
      setApplications(prev => prev.filter(a => a.id !== tempId))
      showToast('Något gick fel.', 'error')
    }
  }

  const handleApply = async (shiftId: number, force = false) => {
    // Optimistic: add a pending app immediately so the UI reacts instantly
    const tempId = -Date.now()
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

    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftId, force }),
    })
    const data = await res.json()

    if (res.ok && data.warning === 'CONSECUTIVE_DAYS') {
      // Revert optimistic — warning needs confirmation
      setApplications(prev => prev.filter(a => a.id !== tempId))
      setConsecutiveWarning({ shiftId, count: data.count })
      return
    }
    if (res.ok) {
      // Replace temp with real
      setApplications(prev => prev.map(a => a.id === tempId ? { ...optimisticApp, id: data.id ?? tempId } : a))
      showToast('Intresseanmälan skickad!')
    } else {
      setApplications(prev => prev.filter(a => a.id !== tempId))
      showToast('Något gick fel.', 'error')
    }
  }

  const handleWithdraw = async (appId: number) => {
    // Optimistic: remove from local state instantly
    const previous = applications
    setApplications(prev => prev.filter(a => a.id !== appId))

    const res = await fetch(`/api/applications/${appId}`, { method: 'DELETE' })
    if (res.ok) {
      showToast('Anmälan återkallad.')
    } else {
      // Revert
      setApplications(previous)
      const data = await res.json().catch(() => ({}))
      if (data.error === 'ALREADY_APPROVED') showToast('Du är redan godkänd — kontakta trafikledningen.', 'error')
      else showToast('Något gick fel.', 'error')
    }
  }

  if (!weekData) {
    return (
      <div className="driver-shell">
        <div className="driver-frame">
          <div className="driver-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Laddar…</span>
          </div>
        </div>
      </div>
    )
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

  // All confirmed (including past weeks from applications list)
  const allConfirmed = applications.filter(a => a.approved)

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
              <div style={{ textAlign: 'right' }}>
                <div className="who">{user?.name}</div>
                <div className="role">{user?.role === 'admin' ? 'Trafikledare' : 'Chaufför'}</div>
              </div>
              <div className="avatar">{initials(user?.name)}</div>
              {user?.role === 'admin' && (
                <button className="btn btn-sm" onClick={() => router.push('/admin')}>Adminvy</button>
              )}
              <button className="btn-ghost btn btn-icon" onClick={() => signOut({ callbackUrl: '/' })}>
                <LogOut className="svg-ico" />
              </button>
            </div>
          </div>

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

          {/* Confirmed strip */}
          <div className="section-h">
            <span className="t">Mina bekräftade pass</span>
            <span className="count">{allConfirmed.length} st</span>
          </div>
          {allConfirmed.length === 0
            ? <div className="empty-state">Inga bekräftade pass än. Anmäl intresse ovan.</div>
            : <div className="confirmed-strip">
                {allConfirmed.map(a => (
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
          <button className="btn-ghost btn btn-icon" onClick={() => signOut({ callbackUrl: '/' })}>
            <LogOut className="svg-ico" />
          </button>
        </div>

        <div className="driver-body">
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
            <span className="t">Mina bekräftade pass</span>
            <span className="count">{allConfirmed.length}</span>
          </div>
          {allConfirmed.length === 0
            ? <div className="empty-state">Inga bekräftade pass än. Anmäl intresse ovan.</div>
            : allConfirmed.map(a => <ConfirmedRow key={a.id} app={a} shifts={weekData.shifts} days={weekData.days} />)
          }
        </div>

        {/* Tab bar */}
        <nav className="tabbar">
          <button className="tab active">
            <Home className="svg-ico ico" />
            Pass
          </button>
          {user?.role === 'admin' && (
            <button className="tab" onClick={() => router.push('/admin')}>
              <Settings className="svg-ico ico" />
              Admin
            </button>
          )}
          <button className="tab">
            <User className="svg-ico ico" />
            Profil
          </button>
        </nav>
      </div>
      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
      {consecutiveWarning && <ConsecutiveWarning count={consecutiveWarning.count} onConfirm={() => { const id = consecutiveWarning.shiftId; setConsecutiveWarning(null); handleApply(id, true) }} onCancel={() => setConsecutiveWarning(null)} />}
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
  const cardClass = `day-card is-${status}`

  const badgeLabel: Record<DayStatus, string> = { closed: 'Stängd', open: 'Öppen', pending: 'Sökt', confirmed: 'Bekräftad', full: 'Fullbokad', rejected: 'Nekad', withdrawn: 'Avbokad', reserve: 'Reserv' }
  const badgeClass: Record<DayStatus, string> = { closed: 'b-closed', open: 'b-open', pending: 'b-pending', confirmed: 'b-confirmed', full: 'b-full', rejected: 'b-rejected', withdrawn: 'b-closed', reserve: 'b-reserve' }

  return (
    <div className={cardClass}>
      <div className="accent-bar" />
      <div className="day-row1">
        <div>
          <div className="day-label">{day.label}</div>
          <div className="day-date">{fmt(day.date)}</div>
        </div>
        <span className={`badge ${badgeClass[status]}`}>
          <span className="pip" />{badgeLabel[status]}
        </span>
      </div>
      <div className="day-row2">
        <span className="hours">
          <Clock className="svg-ico svg-ico-sm" />
          {day.startTime}–{day.endTime}
        </span>
      </div>
      {status === 'open' && day.shift && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="day-action is-apply" onClick={() => onApply(day.shift!.id)}>Anmäl intresse</button>
          <button className="day-action is-reserve" onClick={() => onApplyReserve(day.shift!.id)}>Anmäl som reserv</button>
        </div>
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
      {(status === 'closed' || status === 'confirmed') && (
        <button className="day-action is-disabled" disabled>
          {status === 'closed' ? 'Stängd för anmälan' : 'Bekräftad ✓'}
        </button>
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
      {status === 'closed' && day.holiday && (
        <p className="day-holiday-reason">
          {day.holiday.type === 'holiday' ? 'Röd dag' : 'Afton'} · {day.holiday.name}
        </p>
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
