'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser, useSignOut } from '@/lib/supabase/use-user'
import { Clock, Home, Calendar, Settings, User, LogOut } from './Icons'
import { CurrentWeekBadge } from './CurrentWeekBadge'

interface MineApp {
  id: number
  shift_id: number
  approved: boolean
  rejected: number
  withdrawn: number
  reserve: number
  shift_date: string
  shift_day_index: number
  shift_week_year: number
  shift_week_number: number
}

const DAY_LABELS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag']

function shiftHours(dayIndex: number) {
  if (dayIndex === 5) return { start: '09:45', end: '16:30' }
  return { start: '16:00', end: '22:00' }
}

function fmtDate(dateStr: string) {
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface WeekGroup {
  year: number
  week: number
  shifts: MineApp[]
}

export function MySchedule() {
  const authUser = useUser()
  const signOut = useSignOut()
  const [role, setRole] = useState<'driver' | 'admin' | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [apps, setApps] = useState<MineApp[] | null>(null)
  const [showPast, setShowPast] = useState(false)

  const user = authUser ? { ...authUser, role } : null

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!authUser) return
    fetch('/api/users/me').then(r => r.ok ? r.json() : null).then(d => { if (d?.role) setRole(d.role) }).catch(() => {})
  }, [authUser])

  const load = () => {
    fetch('/api/applications/mine')
      .then(r => r.ok ? r.json() : [])
      .then((data: MineApp[]) => setApps(data))
      .catch(() => setApps([]))
  }

  useEffect(() => { load() }, [])
  // Light polling so newly-approved shifts appear without a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) load() }, 15000)
    return () => clearInterval(interval)
  }, [])

  const { upcoming, past } = useMemo(() => {
    const today = todayStr()
    const booked = (apps ?? []).filter(a => a.approved && a.withdrawn === 0 && a.rejected === 0 && a.reserve !== 1)
    const up = booked.filter(a => a.shift_date >= today).sort((a, b) => a.shift_date.localeCompare(b.shift_date))
    const pa = booked.filter(a => a.shift_date < today).sort((a, b) => b.shift_date.localeCompare(a.shift_date))
    return { upcoming: up, past: pa }
  }, [apps])

  const groupByWeek = (list: MineApp[]): WeekGroup[] => {
    const map = new Map<string, WeekGroup>()
    for (const a of list) {
      const key = `${a.shift_week_year}-${a.shift_week_number}`
      if (!map.has(key)) map.set(key, { year: a.shift_week_year, week: a.shift_week_number, shifts: [] })
      map.get(key)!.shifts.push(a)
    }
    return Array.from(map.values())
  }

  const list = showPast ? past : upcoming
  const groups = groupByWeek(list)

  const scheduleBody = (
    <>
      <div className="sched-toggle">
        <button className={`sched-tab ${!showPast ? 'active' : ''}`} onClick={() => setShowPast(false)}>
          Kommande {upcoming.length > 0 && <span className="sched-count">{upcoming.length}</span>}
        </button>
        <button className={`sched-tab ${showPast ? 'active' : ''}`} onClick={() => setShowPast(true)}>
          Tidigare
        </button>
      </div>

      {apps === null ? (
        <div className="empty-state">Läser in…</div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          {showPast ? 'Inga tidigare pass.' : 'Du har inga bokade pass framöver.'}
        </div>
      ) : (
        groups.map(g => (
          <div key={`${g.year}-${g.week}`} className="sched-week">
            <div className="sched-week-h">Vecka {g.week} · {g.year}</div>
            {g.shifts.map(a => {
              const { start, end } = shiftHours(a.shift_day_index)
              return (
                <div key={a.id} className="sched-row">
                  <div className="sched-daybox">
                    <div className="sched-daynum">{new Date(a.shift_date + 'T12:00:00').getDate()}</div>
                    <div className="sched-dayname">{DAY_LABELS[a.shift_day_index]?.slice(0, 3)}</div>
                  </div>
                  <div className="sched-info">
                    <div className="sched-date">{DAY_LABELS[a.shift_day_index]} {fmtDate(a.shift_date)}</div>
                    <div className="sched-hours">
                      <Clock className="svg-ico svg-ico-sm" />
                      {start}–{end}
                    </div>
                  </div>
                  <span className="badge b-confirmed"><span className="pip" />Bokad</span>
                </div>
              )
            })}
          </div>
        ))
      )}
    </>
  )

  // ---------- Desktop ----------
  if (isDesktop) {
    return (
      <div className="driver-shell desktop">
        <div className="driver-desktop">
          <div className="driver-desktop-header">
            <div className="brand">
              <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
              <div>
                <div className="name">Passbokning</div>
                <div className="sub">Chaufför · Mitt schema</div>
              </div>
            </div>
            <div className="right">
              <CurrentWeekBadge />
              <Link href="/driver" prefetch className="btn btn-sm btn-ghost">Boka pass</Link>
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

          <div className="section-h" style={{ marginTop: 28 }}>
            <span className="t">Mitt schema</span>
          </div>
          <div className="sched-wrap">{scheduleBody}</div>
        </div>
      </div>
    )
  }

  // ---------- Mobile ----------
  return (
    <div className="driver-shell">
      <div className="driver-frame">
        <div className="driver-header">
          <div>
            <div className="title">Mitt schema</div>
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
          {scheduleBody}
        </div>

        <nav className="tabbar">
          <Link href="/driver" prefetch className="tab">
            <Home className="svg-ico ico" />
            Pass
          </Link>
          <button className="tab active">
            <Calendar className="svg-ico ico" />
            Schema
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
    </div>
  )
}
