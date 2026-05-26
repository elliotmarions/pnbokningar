'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Clock, Phone, Check, Plus, Minus } from './Icons'

interface Applicant {
  id: number
  user_id: string
  user_name: string
  user_phone: string | null
  applied_at: string
  approved: boolean
  rejected: boolean
  rejection_reason: string | null
  withdrawn: boolean
  withdrawal_reason: string | null
  reserve: number
}

interface Shift {
  id: number
  day_index: number
  date: string
  is_open: number
  slots: number
}

interface Driver { id: string; name: string; phone: string | null }

interface Props {
  open: boolean
  shift: Shift | null
  dayLabel: string
  onClose: () => void
  onApprove: (appId: number) => Promise<void>
  onUnapprove: (appId: number, reason?: string) => Promise<void>
  onUpdateSlots: (shiftId: number, slots: number) => Promise<void>
  onBookDriver?: (shiftId: number, userId: string) => Promise<void>
  readOnlySlots?: boolean
  onReject?: (appId: number, reason?: string) => Promise<void>
  onUnreject?: (appId: number) => Promise<void>
  onUnwithdraw?: (appId: number) => Promise<void>
  onDeleteApplication?: (appId: number) => Promise<void>
  onPromoteReserve?: (appId: number) => Promise<void>
  onMoveToReserve?: (appId: number) => Promise<void>
  initialApplicants?: unknown[]
}

function fmt(dateStr: string) {
  const months = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function fmtTime(iso: string) {
  return iso.slice(11, 16)
}

export function InterestPanel({ open, shift, dayLabel, onClose, onApprove, onUnapprove, onUpdateSlots, onBookDriver, readOnlySlots = false, onReject, onUnreject, onUnwithdraw, onDeleteApplication, onPromoteReserve, onMoveToReserve, initialApplicants }: Props) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [activeTab, setActiveTab] = useState<'applications' | 'reserves'>('applications')
  const [slots, setSlots] = useState(shift?.slots ?? 5)
  const [slotsInput, setSlotsInput] = useState(String(shift?.slots ?? 5))
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())

  // Book driver state
  const [showBooking, setShowBooking] = useState(false)
  const [allDrivers, setAllDrivers] = useState<Driver[]>([])
  const [driverSearch, setDriverSearch] = useState('')
  const [bookingId, setBookingId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const addPending = (id: number) => setPendingIds(prev => new Set([...prev, id]))
  const removePending = (id: number) => setPendingIds(prev => { const s = new Set(prev); s.delete(id); return s })

  // Stable ref to initialApplicants so we can read it inside the effect without retriggering on every parent refresh.
  const initialApplicantsRef = useRef(initialApplicants)
  initialApplicantsRef.current = initialApplicants

  useEffect(() => {
    if (!shift) return
    setSlots(shift.slots)
    setSlotsInput(String(shift.slots))
    // Sync applicants only when the panel opens for a (new) shift — NOT when the parent refetches
    // and pushes a new initialApplicants reference. Otherwise an optimistic update gets clobbered
    // mid-action which causes the visible "hopping" behavior.
    const prefetched = initialApplicantsRef.current as Applicant[] | undefined
    if (prefetched) {
      setApplicants(prefetched)
      // No need to refetch — parent's data is already fresh.
      return
    }
    fetch(`/api/shifts/${shift.id}`)
      .then(r => r.json())
      .then(d => setApplicants(d.applicants ?? []))
  }, [shift?.id, open])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Fetch all drivers once when panel opens (for booking)
  useEffect(() => {
    if (!open || !onBookDriver) return
    fetch('/api/users')
      .then(r => r.json())
      .then((data: (Driver & { role: string })[]) => {
        setAllDrivers(data.filter(u => u.role === 'driver'))
      })
      .catch(() => {})
  }, [open, onBookDriver])

  // Focus search input when booking section opens
  useEffect(() => {
    if (showBooking) setTimeout(() => searchRef.current?.focus(), 50)
  }, [showBooking])

  const handleBookDriver = async (userId: string, userName: string) => {
    if (!shift || !onBookDriver) return
    setBookingId(userId)
    try {
      await onBookDriver(shift.id, userId)
      // Refresh applicants list
      const d = await fetch(`/api/shifts/${shift.id}`).then(r => r.json())
      setApplicants(d.applicants ?? [])
      setShowBooking(false)
      setDriverSearch('')
    } finally {
      setBookingId(null)
    }
  }

  const approved = applicants.filter(a => a.approved && !a.reserve)
  const pending = applicants.filter(a => !a.approved && !a.rejected && !a.withdrawn && !a.reserve)
  const rejected = applicants.filter(a => a.rejected && !a.reserve)
  const withdrawn = applicants.filter(a => a.withdrawn && !a.approved && !a.reserve)
  const reserves = applicants.filter(a => a.reserve === 1 && !a.approved)

  const handleApprove = async (appId: number) => {
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(a => a.id === appId ? { ...a, approved: true, withdrawn: false } : a))
    try {
      await onApprove(appId)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handleUnapprove = async (appId: number, reason?: string) => {
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(a =>
      a.id === appId ? { ...a, approved: false, withdrawn: true, withdrawal_reason: reason ?? null } : a
    ))
    setWithdrawingId(null)
    setWithdrawReason('')
    try {
      await onUnapprove(appId, reason)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handleReject = async (appId: number, reason: string) => {
    if (!onReject) return
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(x => x.id === appId ? { ...x, rejected: true, rejection_reason: reason || null } : x))
    setRejectingId(null)
    try {
      await onReject(appId, reason || undefined)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handleUnreject = async (appId: number) => {
    if (!onUnreject) return
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(x => x.id === appId ? { ...x, rejected: false, rejection_reason: null } : x))
    try {
      await onUnreject(appId)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handlePromoteReserve = async (appId: number) => {
    if (!onPromoteReserve) return
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(a => a.id === appId ? { ...a, reserve: 0, approved: true } : a))
    try {
      await onPromoteReserve(appId)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handleMoveToReserve = async (appId: number) => {
    if (!onMoveToReserve) return
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(a => a.id === appId ? { ...a, reserve: 1 } : a))
    try {
      await onMoveToReserve(appId)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handleDeleteApplication = async (appId: number) => {
    if (!onDeleteApplication) return
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.filter(a => a.id !== appId))
    try {
      await onDeleteApplication(appId)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handleUnwithdraw = async (appId: number) => {
    if (!onUnwithdraw) return
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(x => x.id === appId ? { ...x, withdrawn: false } : x))
    try {
      await onUnwithdraw(appId)
    } catch {
      setApplicants(snapshot)
    } finally {
      removePending(appId)
    }
  }

  const handleSlots = async (delta: number) => {
    if (!shift) return
    const next = Math.max(1, Math.min(50, slots + delta))
    setSlots(next)
    setSlotsInput(String(next))
    await onUpdateSlots(shift.id, next)
  }
  const handleSlotsInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlotsInput(e.target.value)
  }
  const handleSlotsBlur = async () => {
    if (!shift) return
    const val = parseInt(slotsInput)
    const clamped = isNaN(val) || val < 1 ? 1 : Math.min(50, val)
    setSlots(clamped)
    setSlotsInput(String(clamped))
    await onUpdateSlots(shift.id, clamped)
  }

  const startTime = shift?.day_index === 5 ? '09:45' : '16:00'
  const endTime = shift?.day_index === 5 ? '16:30' : '22:00'

  return (
    <>
      <div className={`side-panel-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`side-panel ${open ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="side-panel-head">
          <div>
            <h2>{dayLabel} {shift ? fmt(shift.date) : ''}</h2>
            <div className="sub">
              <Clock className="svg-ico svg-ico-sm" />
              {startTime}–{endTime}
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Stäng">
            <X className="svg-ico" />
          </button>
        </div>

        <div className="side-panel-meta">
          {!readOnlySlots && (
            <div className="slots-field">
              <label>Platser</label>
              <div className="num-input">
                <button onClick={() => handleSlots(-1)}><Minus className="svg-ico svg-ico-sm" /></button>
                <input type="number" value={slotsInput} min={1} max={50} onChange={handleSlotsInput} onBlur={handleSlotsBlur} />
                <button onClick={() => handleSlots(+1)}><Plus className="svg-ico svg-ico-sm" /></button>
              </div>
            </div>
          )}
          <div className="fill-stat">
            <strong>{approved.length}</strong> godkända av <strong>{slots}</strong> · <strong>{pending.length}</strong> väntar
          </div>
        </div>

        {/* Tabs */}
        <div className="ip-tabs">
          <button
            className={`ip-tab ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => setActiveTab('applications')}
          >
            Ansökningar
            {(approved.length + pending.length) > 0 && (
              <span className="ip-tab-badge">{approved.length + pending.length}</span>
            )}
          </button>
          <button
            className={`ip-tab ${activeTab === 'reserves' ? 'active' : ''}`}
            onClick={() => setActiveTab('reserves')}
          >
            Reserver
            {reserves.length > 0 && (
              <span className="ip-tab-badge">{reserves.length}</span>
            )}
          </button>
        </div>

        <div className="side-panel-list">
          {activeTab === 'applications' && <>
          {/* Approved group */}
          <div className="list-group-h">
            <span>Godkända</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{approved.length} / {slots}</span>
              {onBookDriver && (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '2px 8px', fontSize: 11, gap: 4 }}
                  onClick={() => { setShowBooking(b => !b); setDriverSearch('') }}
                >
                  <Plus className="svg-ico" style={{ width: 11, height: 11 }} />
                  Boka manuellt
                </button>
              )}
            </div>
          </div>

          {/* Inline driver booking */}
          {showBooking && onBookDriver && (() => {
            const bookedIds = new Set(applicants.map(a => a.user_id))
            const filtered = allDrivers.filter(d =>
              !bookedIds.has(d.id) &&
              d.name.toLowerCase().includes(driverSearch.toLowerCase())
            )
            return (
              <div className="book-driver-panel">
                <input
                  ref={searchRef}
                  className="book-driver-search"
                  placeholder="Sök chaufför…"
                  value={driverSearch}
                  onChange={e => setDriverSearch(e.target.value)}
                />
                <div className="book-driver-list">
                  {filtered.length === 0
                    ? <div className="book-driver-empty">Inga chaufförer att visa</div>
                    : filtered.map(d => (
                        <button
                          key={d.id}
                          className="book-driver-row"
                          disabled={bookingId === d.id}
                          onClick={() => handleBookDriver(d.id, d.name)}
                        >
                          <div className="avatar" style={{ width: 26, height: 26, fontSize: 10, flexShrink: 0 }}>
                            {initials(d.name)}
                          </div>
                          <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
                            {d.phone && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.phone}</div>}
                          </div>
                          {bookingId === d.id
                            ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bokar…</span>
                            : <span style={{ fontSize: 11, color: 'var(--primary)' }}>Boka</span>
                          }
                        </button>
                      ))
                  }
                </div>
              </div>
            )
          })()}
          {approved.length === 0
            ? <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12.5, padding: '0 6px' }}>Inga godkända ännu.</p>
            : approved.map(a => (
              <div key={a.id}>
                <div className="applicant-row approved">
                  <div className="avatar lg">{initials(a.user_name)}</div>
                  <div className="info">
                    <div className="name">
                      {a.user_name}
                      <span className="badge b-confirmed" style={{ fontSize: 11 }}><span className="pip" />Godkänd</span>
                    </div>
                    <div className="meta">
                      {a.user_phone && <><Phone className="svg-ico svg-ico-sm" />{a.user_phone}</>}
                      <span className="sep">·</span>
                      anmäld {fmtTime(a.applied_at)}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-danger-ghost btn-icon"
                      title="Avboka"
                      disabled={pendingIds.has(a.id)}
                      onClick={() => { setWithdrawingId(a.id); setWithdrawReason('') }}
                    >
                      <X className="svg-ico svg-ico-sm" />
                    </button>
                  </div>
                </div>
                {withdrawingId === a.id && (
                  <div className="reject-form">
                    <textarea
                      className="reject-textarea"
                      placeholder="Anledning till avbokning (valfritt, visas bara internt)…"
                      value={withdrawReason}
                      onChange={e => setWithdrawReason(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                    <div className="reject-form-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => setWithdrawingId(null)}>Avbryt</button>
                      <button className="btn btn-sm btn-danger" disabled={pendingIds.has(a.id)} onClick={() => handleUnapprove(a.id, withdrawReason || undefined)}>
                        Avboka
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          }

          {/* Pending group */}
          <div className="list-group-h">
            <span>Väntar på godkännande</span>
            <span className="badge b-pending"><span className="pip" />{pending.length}</span>
          </div>
          {pending.length === 0
            ? <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12.5, padding: '0 6px' }}>Inga väntande sökande.</p>
            : pending.map((a, i) => (
              <div key={a.id}>
                <div className="applicant-row">
                  <div className="avatar lg">{initials(a.user_name)}</div>
                  <div className="info">
                    <div className="name">
                      <span className="order-tag">#{i + 1}</span>
                      {a.user_name}
                    </div>
                    <div className="meta">
                      {a.user_phone && <><Phone className="svg-ico svg-ico-sm" />{a.user_phone}<span className="sep">·</span></>}
                      <span className="applied-time">anmäld {fmtTime(a.applied_at)}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-success btn-icon"
                      disabled={approved.length >= slots || pendingIds.has(a.id)}
                      onClick={() => handleApprove(a.id)}
                      title="Godkänn"
                    >
                      <Check className="svg-ico svg-ico-sm" />
                    </button>
                    {onReject && (
                      <button
                        className="btn btn-sm btn-danger-ghost btn-icon"
                        disabled={pendingIds.has(a.id)}
                        onClick={() => { setRejectingId(a.id); setRejectReason('') }}
                        title="Neka"
                      >
                        <X className="svg-ico svg-ico-sm" />
                      </button>
                    )}
                    {onMoveToReserve && (
                      <button
                        className="btn btn-sm btn-ghost ip-reserve-btn"
                        disabled={pendingIds.has(a.id)}
                        onClick={() => handleMoveToReserve(a.id)}
                        title="Flytta till reservlista"
                      >
                        Reserv
                      </button>
                    )}
                  </div>
                </div>
                {rejectingId === a.id && onReject && (
                  <div className="reject-form">
                    <textarea
                      className="reject-textarea"
                      placeholder="Motivering (valfritt)…"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      rows={2}
                      autoFocus
                    />
                    <div className="reject-form-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => setRejectingId(null)}>Avbryt</button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={pendingIds.has(a.id)}
                        onClick={() => handleReject(a.id, rejectReason)}
                      >
                        Neka
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          }

          {/* Rejected group — always visible */}
          <div className="list-group-h" style={{ marginTop: 12 }}>
            <span>Nekade</span>
            {rejected.length > 0 && <span className="badge b-closed">{rejected.length}</span>}
          </div>
          {rejected.length === 0
            ? <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12.5, padding: '0 6px' }}>Inga nekade.</p>
            : rejected.map(a => (
              <div key={a.id} className="applicant-row" style={{ opacity: 0.7 }}>
                <div className="avatar lg" style={{ background: '#3f1a1a' }}>{initials(a.user_name)}</div>
                <div className="info">
                  <div className="name" style={{ textDecoration: 'line-through' }}>{a.user_name}</div>
                  {a.rejection_reason && <div className="meta" style={{ color: '#F87171' }}>"{a.rejection_reason}"</div>}
                </div>
                <div className="actions">
                  {onUnreject && (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11 }}
                      disabled={pendingIds.has(a.id)}
                      onClick={() => handleUnreject(a.id)}
                    >
                      Ångra
                    </button>
                  )}
                  {onDeleteApplication && (
                    <button
                      className="btn btn-sm btn-danger-ghost btn-icon"
                      title="Ta bort permanent"
                      disabled={pendingIds.has(a.id)}
                      onClick={() => handleDeleteApplication(a.id)}
                    >
                      <X className="svg-ico svg-ico-sm" />
                    </button>
                  )}
                </div>
              </div>
            ))
          }

          {/* Withdrawn group — always visible */}
          <div className="list-group-h" style={{ marginTop: 12 }}>
            <span>Avbokade</span>
            {withdrawn.length > 0 && <span className="badge b-closed">{withdrawn.length}</span>}
          </div>
          {withdrawn.length === 0
            ? <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12.5, padding: '0 6px' }}>Inga avbokade.</p>
            : withdrawn.map(a => (
              <div key={a.id} className="applicant-row" style={{ opacity: 0.7 }}>
                <div className="avatar lg" style={{ background: '#3a2f1a' }}>{initials(a.user_name)}</div>
                <div className="info">
                  <div className="name" style={{ textDecoration: 'line-through' }}>{a.user_name}</div>
                  <div className="meta">
                    {a.user_phone && <><Phone className="svg-ico svg-ico-sm" />{a.user_phone}</>}
                  </div>
                  {a.withdrawal_reason && (
                    <div className="meta" style={{ color: '#F59E0B', marginTop: 2 }}>
                      Internt: "{a.withdrawal_reason}"
                    </div>
                  )}
                </div>
                <div className="actions">
                  {onUnwithdraw && (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11 }}
                      disabled={pendingIds.has(a.id)}
                      onClick={() => handleUnwithdraw(a.id)}
                    >
                      Ångra
                    </button>
                  )}
                  {onDeleteApplication && (
                    <button
                      className="btn btn-sm btn-danger-ghost btn-icon"
                      title="Ta bort permanent"
                      disabled={pendingIds.has(a.id)}
                      onClick={() => handleDeleteApplication(a.id)}
                    >
                      <X className="svg-ico svg-ico-sm" />
                    </button>
                  )}
                </div>
              </div>
            ))
          }
          </>}

          {activeTab === 'reserves' && <>
          {/* Reserve list */}
          <div className="list-group-h">
            <span>Reservlista</span>
            {reserves.length > 0 && <span className="badge b-reserve">{reserves.length}</span>}
          </div>
          {reserves.length === 0
            ? <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12.5, padding: '0 6px' }}>Ingen på reservlistan.</p>
            : reserves.map((a, i) => (
              <div key={a.id} className="applicant-row reserve-row">
                <div className="avatar lg" style={{ background: '#1a2a3a' }}>{initials(a.user_name)}</div>
                <div className="info">
                  <div className="name">
                    <span className="order-tag">#{i + 1}</span>
                    {a.user_name}
                  </div>
                  <div className="meta">
                    {a.user_phone && <><Phone className="svg-ico svg-ico-sm" />{a.user_phone}</>}
                  </div>
                </div>
                <div className="actions">
                  {onPromoteReserve && (
                    <button
                      className="btn btn-sm btn-success"
                      disabled={pendingIds.has(a.id)}
                      onClick={() => handlePromoteReserve(a.id)}
                      title="Flytta till godkänd"
                    >
                      <Check className="svg-ico svg-ico-sm" />
                      Boka in
                    </button>
                  )}
                  {onDeleteApplication && (
                    <button
                      className="btn btn-sm btn-danger-ghost btn-icon"
                      title="Ta bort från reservlista"
                      disabled={pendingIds.has(a.id)}
                      onClick={() => handleDeleteApplication(a.id)}
                    >
                      <X className="svg-ico svg-ico-sm" />
                    </button>
                  )}
                </div>
              </div>
            ))
          }
          </>}
        </div>
      </div>
    </>
  )
}
