'use client'
import { useEffect, useState, useMemo, Fragment } from 'react'
import { Plus, Trash2, X, Check } from './Icons'
import { getHolidayMap } from '../lib/holidays'
import { useAdminCache } from './AdminCacheProvider'

interface Driver { id: string; name: string; phone: string | null; role: string }
interface CustomClosed { id: number; date: string; reason: string; color: string }
interface Booking {
  id: number
  user_id: string
  user_name: string
  user_phone: string | null
  from_date: string
  to_date: string
  excluded_dates: string // JSON string array
  notes: string | null
  created_at: string
}

const DAY_SHORT = ['Mån','Tis','Ons','Tor','Fre','Lör']
const MONTHS = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']

function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
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

// Returns all Mon-Sat dates in range, grouped by ISO week, with locked flag for closed days
function buildWeekGroups(
  fromDate: string,
  toDate: string,
  lockedDates: Set<string>
): { wk: number; days: { date: string; dayIdx: number; n: number; locked: boolean }[] }[] {
  const from = new Date(fromDate + 'T00:00:00')
  const to   = new Date(toDate   + 'T00:00:00')
  const groups: { wk: number; days: { date: string; dayIdx: number; n: number; locked: boolean }[] }[] = []
  let cur = new Date(from)
  while (cur <= to) {
    const dow = cur.getDay()
    if (dow >= 1 && dow <= 6) {
      const wk = isoWeek(cur)
      const ds = toStr(cur)
      const dayIdx = dow - 1
      let group = groups.find(g => g.wk === wk)
      if (!group) { group = { wk, days: [] }; groups.push(group) }
      group.days.push({ date: ds, dayIdx, n: cur.getDate(), locked: lockedDates.has(ds) })
    }
    cur = addDays(cur, 1)
  }
  return groups
}

const LT_CACHE_KEY = 'long-term-bookings'
const CC_CACHE_KEY = 'custom-closed'
const USERS_CACHE_KEY = 'users'

export function LongTermBookings() {
  const cache = useAdminCache()
  const [bookings, setBookings] = useState<Booking[]>(() => (cache.get(LT_CACHE_KEY) as Booking[]) ?? [])
  const [drivers, setDrivers] = useState<Driver[]>(() => {
    const u = cache.get(USERS_CACHE_KEY) as Driver[] | undefined
    return u ? u.filter(d => d.role === 'driver') : []
  })
  const [loading, setLoading] = useState(!cache.get(LT_CACHE_KEY))
  const [showCreate, setShowCreate] = useState(false)

  // Create form state
  const today = toStr(new Date())
  const [selDriver, setSelDriver] = useState('')
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate]     = useState(today)
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [togglingDate, setTogglingDate] = useState<string | null>(null) // "bookingId:date"
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const toggleExpand = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const [customClosed, setCustomClosed] = useState<CustomClosed[]>(() => (cache.get(CC_CACHE_KEY) as CustomClosed[]) ?? [])

  useEffect(() => {
    // SWR: serve cached data instantly, revalidate in background.
    Promise.all([
      fetch('/api/long-term').then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
      fetch('/api/custom-closed').then(r => r.json()),
    ]).then(([lt, users, cc]) => {
      const bookingsData: Booking[] = lt.bookings ?? []
      const driversData: Driver[] = (users as Driver[]).filter(u => u.role === 'driver')
      const ccData: CustomClosed[] = cc.days ?? []
      setBookings(bookingsData)
      setDrivers(driversData)
      setCustomClosed(ccData)
      cache.set(LT_CACHE_KEY, bookingsData)
      cache.set(USERS_CACHE_KEY, users)
      cache.set(CC_CACHE_KEY, ccData)
    }).finally(() => setLoading(false))
  }, [cache])

  const handleCreate = async () => {
    if (!selDriver || !fromDate || !toDate) return
    const driver = drivers.find(d => d.id === selDriver)
    if (!driver) return

    // Optimistic: prepend a temp-id booking using local driver info, close the
    // dialog and reset the form immediately. Replace temp with real id from
    // POST response. On failure, remove + show error.
    const tempId = -Date.now()
    const optimistic: Booking = {
      id: tempId,
      user_id: driver.id,
      user_name: driver.name,
      user_phone: driver.phone,
      from_date: fromDate,
      to_date: toDate,
      excluded_dates: '[]',
      notes: notes || null,
      created_at: new Date().toISOString(),
    }
    const snapshot = bookings
    const next = [...bookings, optimistic].sort((a, b) =>
      a.from_date.localeCompare(b.from_date) || a.user_name.localeCompare(b.user_name)
    )
    setBookings(next)
    cache.set(LT_CACHE_KEY, next)
    setShowCreate(false)
    const savedDriverId = selDriver
    setSelDriver(''); setFromDate(today); setToDate(today); setNotes('')
    setSaving(true)

    try {
      const res = await fetch('/api/long-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: savedDriverId, fromDate: optimistic.from_date, toDate: optimistic.to_date, notes: optimistic.notes ?? undefined }),
      })
      if (!res.ok) throw new Error('create failed')
      const { id } = await res.json() as { id: number }
      setBookings(prev => {
        const replaced = prev.map(b => b.id === tempId ? { ...b, id } : b)
        cache.set(LT_CACHE_KEY, replaced)
        return replaced
      })
    } catch {
      setBookings(snapshot)
      cache.set(LT_CACHE_KEY, snapshot)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    // Optimistic: remove instantly, rollback on failure.
    const snapshot = bookings
    setDeletingId(id)
    setBookings(prev => {
      const next = prev.filter(b => b.id !== id)
      cache.set(LT_CACHE_KEY, next)
      return next
    })
    try {
      const res = await fetch(`/api/long-term/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setBookings(snapshot)
      cache.set(LT_CACHE_KEY, snapshot)
    } finally { setDeletingId(null) }
  }

  const handleToggleDate = async (bookingId: number, date: string) => {
    const key = `${bookingId}:${date}`
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return

    // Optimistic toggle — compute next excluded set locally, apply now.
    let excludedArr: string[]
    try { excludedArr = JSON.parse(booking.excluded_dates || '[]') as string[] } catch { excludedArr = [] }
    const has = excludedArr.includes(date)
    const nextExcluded = has ? excludedArr.filter(d => d !== date) : [...excludedArr, date]
    const snapshot = bookings
    const optimisticBookings = bookings.map(b =>
      b.id === bookingId ? { ...b, excluded_dates: JSON.stringify(nextExcluded) } : b
    )
    setBookings(optimisticBookings)
    cache.set(LT_CACHE_KEY, optimisticBookings)
    setTogglingDate(key)

    try {
      const res = await fetch(`/api/long-term/${bookingId}/toggle-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (!res.ok) throw new Error('toggle failed')
      // Reconcile with canonical excluded list from server.
      const { excluded } = await res.json() as { excluded: string[] }
      setBookings(prev => {
        const next = prev.map(b =>
          b.id === bookingId ? { ...b, excluded_dates: JSON.stringify(excluded) } : b
        )
        cache.set(LT_CACHE_KEY, next)
        return next
      })
    } catch {
      setBookings(snapshot)
      cache.set(LT_CACHE_KEY, snapshot)
    } finally { setTogglingDate(null) }
  }

  const lockedDates = useMemo(() => {
    const set = new Set<string>()
    const customSet = new Set(customClosed.map(d => d.date))
    // Build holiday maps for nearby years
    const thisYear = new Date().getFullYear()
    for (let y = thisYear - 1; y <= thisYear + 3; y++) {
      for (const [date] of getHolidayMap(y)) set.add(date)
    }
    for (const d of customSet) set.add(d)
    return set
  }, [customClosed])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0,1,2].map(i => <div key={i} className="skel" style={{ height: 120, borderRadius: 8 }} />)}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', fontWeight: 500, marginBottom: 4 }}>
            {bookings.length} aktiva bokningar
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Plus className="svg-ico svg-ico-sm" />
          Ny bokning
        </button>
      </div>

      {/* Booking cards */}
      {bookings.length === 0 ? (
        <div className="empty-state">Inga långtidsbokningar ännu.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {bookings.map(b => {
            const excluded: string[] = JSON.parse(b.excluded_dates)
            const groups = buildWeekGroups(b.from_date, b.to_date, lockedDates)
            const totalDays  = groups.reduce((s, g) => s + g.days.filter(d => !d.locked).length, 0)
            const activeDays = totalDays - excluded.filter(d => !lockedDates.has(d)).length
            const isExpanded = expandedIds.has(b.id)
            return (
              <div key={b.id} className="lt-card">
                {/* Card header — click to expand/collapse the day chips */}
                <div
                  className="lt-card-head"
                  onClick={() => toggleExpand(b.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12, width: 12, flex: '0 0 12px' }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                    <div className="avatar lg">{initials(b.user_name)}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{b.user_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {fmt(b.from_date)} – {fmt(b.to_date)}
                        <span style={{ marginLeft: 8, color: 'var(--text-tertiary)' }}>·</span>
                        <span style={{ marginLeft: 8 }}>{activeDays} av {totalDays} dagar</span>
                      </div>
                      {b.notes && <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>{b.notes}</div>}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-danger-ghost btn-icon"
                    disabled={deletingId === b.id}
                    onClick={(e) => { e.stopPropagation(); handleDelete(b.id) }}
                    title="Ta bort bokning"
                  >
                    <Trash2 className="svg-ico svg-ico-sm" />
                  </button>
                </div>

                {/* Day chips by week — only when expanded */}
                {isExpanded && (
                <div className="lt-weeks">
                  {groups.map((group, gi) => {
                    // New-month line between week rows: this row's first day is a
                    // different month than the previous row's last day.
                    const prevGroup = groups[gi - 1]
                    const monthStart = !!prevGroup &&
                      prevGroup.days[prevGroup.days.length - 1].date.slice(5, 7) !== group.days[0].date.slice(5, 7)
                    return (
                    <div key={group.wk} className={`lt-week-row${monthStart ? ' month-start' : ''}`}>
                      <span className="lt-week-label">v{group.wk}</span>
                      <div className="lt-chips">
                        {group.days.map((d, i) => {
                          const isExcluded = excluded.includes(d.date)
                          const isToggling = togglingDate === `${b.id}:${d.date}`
                          const isPast = d.date < today
                          // Vertical line when the month changes mid-week.
                          const monthChanged = i > 0 &&
                            group.days[i - 1].date.slice(5, 7) !== d.date.slice(5, 7)

                          let chip
                          if (isPast && !d.locked && !isExcluded) {
                            // Passed day that was booked → show red, not editable.
                            chip = (
                              <div className="lt-chip past" style={{ cursor: 'default' }} title="Datumet har passerat">
                                <span className="lt-chip-day">{DAY_SHORT[d.dayIdx]}</span>
                                <span className="lt-chip-n">{d.n}</span>
                              </div>
                            )
                          } else if (d.locked) {
                            chip = (
                              <div className="lt-chip excluded" style={{ opacity: 0.4, cursor: 'not-allowed' }} title="Stängd dag – kan ej bokas">
                                <span className="lt-chip-day">{DAY_SHORT[d.dayIdx]}</span>
                                <span className="lt-chip-n">{d.n}</span>
                              </div>
                            )
                          } else {
                            chip = (
                              <button
                                className={`lt-chip ${isExcluded ? 'excluded' : 'active'}`}
                                onClick={() => handleToggleDate(b.id, d.date)}
                                disabled={isToggling}
                                title={isExcluded ? 'Klicka för att inkludera' : 'Klicka för att undanta'}
                              >
                                <span className="lt-chip-day">{DAY_SHORT[d.dayIdx]}</span>
                                <span className="lt-chip-n">{d.n}</span>
                              </button>
                            )
                          }
                          return (
                            <Fragment key={d.date}>
                              {monthChanged && <span className="lt-month-sep" aria-hidden="true" />}
                              {chip}
                            </Fragment>
                          )
                        })}
                      </div>
                    </div>
                    )
                  })}
                </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div className="modal-title" style={{ marginBottom: 0 }}>Ny långtidsbokning</div>
              <button className="close-btn" onClick={() => setShowCreate(false)}><X className="svg-ico" /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 22 }}>
              <div className="field">
                <label>Chaufför</label>
                <select
                  value={selDriver}
                  onChange={e => setSelDriver(e.target.value)}
                  style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: 6, fontSize: 13, outline: 'none', colorScheme: 'dark' }}
                >
                  <option value="">Välj chaufför…</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Från</label>
                  <input type="date" className="date-range-input" style={{ width: '100%' }} value={fromDate} min={today} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Till</label>
                  <input type="date" className="date-range-input" style={{ width: '100%' }} value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>

              <div className="field">
                <label>Anteckning (valfritt)</label>
                <input
                  type="text"
                  placeholder="T.ex. sommarvikariat"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: 6, fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => setShowCreate(false)}>Avbryt</button>
              <button
                className="btn btn-sm btn-primary"
                disabled={!selDriver || !fromDate || !toDate || fromDate > toDate || saving}
                onClick={handleCreate}
              >
                <Check className="svg-ico svg-ico-sm" />
                {saving ? 'Sparar…' : 'Boka in'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
