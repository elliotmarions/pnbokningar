'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Clock, Phone, Check, Plus } from './Icons'

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
}

interface Driver { id: string; name: string; phone: string | null }

interface Props {
  open: boolean
  shift: Shift | null
  dayLabel: string
  onClose: () => void
  onApprove: (appId: number) => Promise<void>
  onUnapprove: (appId: number, reason?: string) => Promise<void>
  onBookDriver?: (shiftId: number, userId: string) => Promise<void>
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

// Full date + time for the hover tooltip on "anmäld HH:MM".
function fmtAppliedFull(iso: string) {
  const months = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december']
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return `Anmäld kl. ${fmtTime(iso)}`
  return `Anmäld ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} kl. ${fmtTime(iso)}`
}

export function InterestPanel({ open, shift, dayLabel, onClose, onApprove, onUnapprove, onBookDriver, onReject, onUnreject, onUnwithdraw, onDeleteApplication, onPromoteReserve, onMoveToReserve, initialApplicants }: Props) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [activeTab, setActiveTab] = useState<'applications' | 'reserves' | 'others'>('applications')
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  // Driver (user id) awaiting confirmation before being booked in from "Övriga".
  const [confirmBookId, setConfirmBookId] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  // Ids the user just optimistically removed ("Ta bort helt"). Prevents an
  // in-flight server poll — which still has the row — from re-introducing it.
  // Cleared once the server's poll also stops returning that id.
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set())

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

  // Live merge: while the panel is open and the parent re-polls, add any
  // newly-arrived applications without touching entries the user is in the
  // middle of mutating (those are tracked in pendingIds). New entries appear
  // in the pending list instantly when chaufförer click "Anmäl intresse".
  useEffect(() => {
    if (!open || !shift || !initialApplicants) return
    const incomingRaw = initialApplicants as Applicant[]
    // Filter out entries we just optimistically deleted so an in-flight poll
    // can't re-add them before the server's DELETE finishes processing.
    const incoming = incomingRaw.filter(n => !deletedIds.has(n.id))
    const incomingIds = new Set(incomingRaw.map(a => a.id))

    setApplicants(prev => {
      const byId = new Map(prev.map(a => [a.id, a]))
      const merged = incoming.map(n => {
        const local = byId.get(n.id)
        // Preserve local state for entries with in-flight mutations.
        if (local && pendingIds.has(n.id)) return local
        return n
      })
      // Keep any optimistic temp entries (negative ids) — server doesn't know them yet.
      const temps = prev.filter(a => a.id < 0)
      return [...merged, ...temps]
    })

    // Clear pendingIds for entries where the server has caught up with our
    // optimistic state. Without this, removing pendingIds immediately after
    // the API call would let a stale poll snapshot (in flight from before
    // the mutation) briefly revert the row's status — the "name jumps back
    // for a moment" behavior. Also clears pendingIds for entries that no
    // longer exist on the server (deletion confirmed).
    setPendingIds(prev => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      let changed = false
      for (const id of prev) {
        const server = incomingRaw.find(a => a.id === id)
        const local = applicantsRef.current.find(a => a.id === id)
        // Server has deleted (id no longer in poll) AND local is also gone —
        // mutation completed end-to-end, drop from pending.
        if (!server && !local) {
          next.delete(id)
          changed = true
          continue
        }
        if (!server || !local) continue
        // Normalize to booleans: the server sends 0/1 (numbers) while optimistic
        // mutations set true/false, so `1 === true` would otherwise never match
        // and pendingIds for an approved row would never clear.
        if (
          Boolean(server.approved) === Boolean(local.approved) &&
          Boolean(server.rejected) === Boolean(local.rejected) &&
          Boolean(server.withdrawn) === Boolean(local.withdrawn) &&
          Boolean(server.reserve) === Boolean(local.reserve)
        ) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })

    // Drop deletedIds for entries the server has now also removed — server
    // caught up with the optimistic delete.
    setDeletedIds(prev => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      let changed = false
      for (const id of prev) {
        if (!incomingIds.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [initialApplicants, open, shift?.id, pendingIds, deletedIds])

  // Ref mirror of applicants for use inside the merge effect without putting
  // `applicants` in the dependency array (which would re-run the merge
  // unnecessarily on every state change).
  const applicantsRef = useRef(applicants)
  applicantsRef.current = applicants

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Fetch all drivers when the panel opens — used both for manual booking and
  // for the "Övriga" tab (drivers with no involvement in this shift).
  useEffect(() => {
    if (!open) return
    fetch('/api/users')
      .then(r => r.json())
      .then((data: (Driver & { role: string })[]) => {
        setAllDrivers(data.filter(u => u.role === 'driver'))
      })
      .catch(() => {})
  }, [open])

  // Focus search input when booking section opens
  useEffect(() => {
    if (showBooking) setTimeout(() => searchRef.current?.focus(), 50)
  }, [showBooking])

  const handleBookDriver = async (userId: string, userName: string) => {
    if (!shift || !onBookDriver) return
    const driver = allDrivers.find(d => d.id === userId)
    setBookingId(userId)

    // Optimistic: close the booking UI, drop an approved applicant into the list
    // immediately. Temp negative id; replaced by canonical data once the
    // background refetch resolves.
    const tempId = -Date.now()
    const optimisticEntry: Applicant = {
      id: tempId,
      user_id: userId,
      user_name: userName,
      user_phone: driver?.phone ?? null,
      applied_at: new Date().toISOString(),
      approved: true,
      rejected: false,
      rejection_reason: null,
      withdrawn: false,
      withdrawal_reason: null,
      reserve: 0,
    }
    const snapshot = applicants
    // If the driver already has an application (e.g. previously withdrawn),
    // mutate it instead of duplicating. Otherwise append.
    const existingIdx = applicants.findIndex(a => a.user_id === userId)
    if (existingIdx >= 0) {
      setApplicants(prev => prev.map(a => a.user_id === userId
        ? { ...a, approved: true, rejected: false, withdrawn: false, rejection_reason: null, withdrawal_reason: null, reserve: 0 }
        : a))
    } else {
      setApplicants(prev => [...prev, optimisticEntry])
    }
    setShowBooking(false)
    setDriverSearch('')

    try {
      await onBookDriver(shift.id, userId)
      // Reconcile with canonical data — replaces temp id, fixes any field drift.
      const d = await fetch(`/api/shifts/${shift.id}`).then(r => r.json())
      setApplicants(d.applicants ?? [])
    } catch {
      // Parent handler already shows error toast + rolled back its counts.
      setApplicants(snapshot)
    } finally {
      setBookingId(null)
    }
  }

  const approved = applicants.filter(a => a.approved && !a.reserve)
  const pending = applicants.filter(a => !a.approved && !a.rejected && !a.withdrawn && !a.reserve)
  const rejected = applicants.filter(a => a.rejected && !a.reserve)
  const withdrawn = applicants.filter(a => a.withdrawn && !a.approved && !a.reserve)
  const reserves = applicants.filter(a => a.reserve === 1 && !a.approved)

  // Drivers with no involvement in this shift at all — not applied, approved,
  // rejected, withdrawn or on the reserve list. Available to book in directly.
  const involvedIds = new Set(applicants.map(a => a.user_id))
  const others = allDrivers
    .filter(d => !involvedIds.has(d.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  // Stable applied-order rank: #1 is the first to apply, #2 the second, etc.
  // Computed across the entire shift (any status) so approving/rejecting one
  // applicant does NOT renumber everyone below them.
  const appliedRank: Record<number, number> = {}
  ;[...applicants]
    .filter(a => a.id > 0) // skip optimistic temp entries
    .sort((a, b) => a.applied_at.localeCompare(b.applied_at))
    .forEach((a, i) => { appliedRank[a.id] = i + 1 })

  // For all mutations below, we DON'T clear pendingIds in `finally`. Instead
  // the merge effect clears it once the server's next poll confirms our
  // optimistic state — that way a stale poll snapshot from before the
  // mutation can't briefly revert the row.

  const handleApprove = async (appId: number) => {
    const snapshot = applicants
    addPending(appId)
    setApplicants(prev => prev.map(a => a.id === appId ? { ...a, approved: true, withdrawn: false } : a))
    try {
      await onApprove(appId)
    } catch {
      setApplicants(snapshot)
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
      removePending(appId)
    }
  }

  const handleMoveToReserve = async (appId: number) => {
    if (!onMoveToReserve) return
    const snapshot = applicants
    addPending(appId)
    // When moving an approved driver to reserve we also clear the approval
    // and any prior rejection/withdrawal — mirrors the server-side change.
    setApplicants(prev => prev.map(a => a.id === appId
      ? { ...a, reserve: 1, approved: false, rejected: false, withdrawn: false, withdrawal_reason: null, rejection_reason: null }
      : a
    ))
    try {
      await onMoveToReserve(appId)
    } catch {
      setApplicants(snapshot)
      removePending(appId)
    }
  }

  const handleDeleteApplication = async (appId: number) => {
    if (!onDeleteApplication) return
    addPending(appId)
    setDeletedIds(prev => new Set([...prev, appId]))
    setApplicants(prev => prev.filter(a => a.id !== appId))
    try {
      await onDeleteApplication(appId)
    } catch {
      // Don't try to restore a stale snapshot — the user may have chained
      // other actions before this delete. The next poll will reconcile.
      setDeletedIds(prev => { const s = new Set(prev); s.delete(appId); return s })
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
      removePending(appId)
    }
  }

  const startTime = shift?.day_index === 5 ? '09:45' : '16:00'
  const endTime = shift?.day_index === 5 ? '18:00' : '22:00'

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
          <div className="fill-stat">
            <strong>{approved.length}</strong> godkända · <strong>{pending.length}</strong> väntar
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
          <button
            className={`ip-tab ${activeTab === 'others' ? 'active' : ''}`}
            onClick={() => setActiveTab('others')}
          >
            Övriga
            {others.length > 0 && (
              <span className="ip-tab-badge">{others.length}</span>
            )}
          </button>
        </div>

        <div className="side-panel-list">
          {activeTab === 'applications' && <>
          {/* Approved group */}
          <div className="list-group-h">
            <span>Godkända</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{approved.length}</span>
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
                      <span title={fmtAppliedFull(a.applied_at)} style={{ cursor: 'help' }}>anmäld {fmtTime(a.applied_at)}</span>
                    </div>
                  </div>
                  <div className="actions">
                    {onMoveToReserve && (
                      <button
                        className="btn btn-sm btn-ghost ip-reserve-btn"
                        title="Flytta till reservlistan"
                        onClick={() => handleMoveToReserve(a.id)}
                      >
                        Reserv
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-danger-ghost btn-icon"
                      title="Avboka"
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
                      <button className="btn btn-sm btn-danger" onClick={() => handleUnapprove(a.id, withdrawReason || undefined)}>
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
            : pending.map(a => (
              <div key={a.id}>
                <div className="applicant-row">
                  <div className="avatar lg">{initials(a.user_name)}</div>
                  <div className="info">
                    <div className="name">
                      <span className="order-tag">#{appliedRank[a.id] ?? '–'}</span>
                      {a.user_name}
                    </div>
                    <div className="meta">
                      {a.user_phone && <><Phone className="svg-ico svg-ico-sm" />{a.user_phone}<span className="sep">·</span></>}
                      <span className="applied-time" title={fmtAppliedFull(a.applied_at)} style={{ cursor: 'help' }}>anmäld {fmtTime(a.applied_at)}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-success btn-icon"
                      onClick={() => handleApprove(a.id)}
                      title="Godkänn"
                    >
                      <Check className="svg-ico svg-ico-sm" />
                    </button>
                    {onReject && (
                      <button
                        className="btn btn-sm btn-danger-ghost btn-icon"
                        onClick={() => { setRejectingId(a.id); setRejectReason('') }}
                        title="Neka"
                      >
                        <X className="svg-ico svg-ico-sm" />
                      </button>
                    )}
                    {onMoveToReserve && (
                      <button
                        className="btn btn-sm btn-ghost ip-reserve-btn"
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

                      onClick={() => handleUnreject(a.id)}
                    >
                      Ångra
                    </button>
                  )}
                  {onDeleteApplication && (
                    <button
                      className="btn btn-sm btn-danger-ghost btn-icon"
                      title="Ta bort permanent"

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

                      onClick={() => handleUnwithdraw(a.id)}
                    >
                      Ångra
                    </button>
                  )}
                  {onDeleteApplication && (
                    <button
                      className="btn btn-sm btn-danger-ghost btn-icon"
                      title="Ta bort permanent"

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {reserves.length > 0 && <span className="badge b-reserve">{reserves.length}</span>}
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

          {activeTab === 'others' && <>
          {/* Drivers with no involvement in this shift — available to book in. */}
          <div className="list-group-h">
            <span>Ej anmälda chaufförer</span>
            {others.length > 0 && <span className="badge b-closed">{others.length}</span>}
          </div>
          {others.length === 0
            ? <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12.5, padding: '0 6px' }}>Alla chaufförer har anmält sig eller är redan inbokade.</p>
            : others.map(d => (
              <div key={d.id}>
                <div className="applicant-row">
                  <div className="avatar lg">{initials(d.name)}</div>
                  <div className="info">
                    <div className="name">{d.name}</div>
                    <div className="meta">
                      {d.phone && <><Phone className="svg-ico svg-ico-sm" />{d.phone}</>}
                    </div>
                  </div>
                  <div className="actions">
                    {onBookDriver && (
                      <button
                        className="btn btn-sm btn-success"
                        disabled={bookingId === d.id}
                        onClick={() => setConfirmBookId(d.id)}
                        title="Boka in chauffören"
                      >
                        <Check className="svg-ico svg-ico-sm" />
                        {bookingId === d.id ? 'Bokar…' : 'Boka in'}
                      </button>
                    )}
                  </div>
                </div>
                {confirmBookId === d.id && onBookDriver && (
                  <div className="reject-form">
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                      Boka in <strong>{d.name}</strong> på {dayLabel} {shift ? fmt(shift.date) : ''}?
                      Chauffören godkänns direkt och får en notis.
                    </p>
                    <div className="reject-form-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => setConfirmBookId(null)}>Avbryt</button>
                      <button
                        className="btn btn-sm btn-success"
                        disabled={bookingId === d.id}
                        onClick={() => { setConfirmBookId(null); handleBookDriver(d.id, d.name) }}
                      >
                        <Check className="svg-ico svg-ico-sm" />
                        Ja, boka in
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          }
          </>}
        </div>
      </div>
    </>
  )
}
