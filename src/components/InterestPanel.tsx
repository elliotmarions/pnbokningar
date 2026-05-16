'use client'
import { useEffect, useState } from 'react'
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
}

interface Shift {
  id: number
  day_index: number
  date: string
  is_open: number
  slots: number
}

interface Props {
  open: boolean
  shift: Shift | null
  dayLabel: string
  onClose: () => void
  onApprove: (appId: number) => Promise<void>
  onUnapprove: (appId: number, reason?: string) => Promise<void>
  onUpdateSlots: (shiftId: number, slots: number) => Promise<void>
  readOnlySlots?: boolean
  onReject?: (appId: number, reason?: string) => Promise<void>
  onUnreject?: (appId: number) => Promise<void>
  onUnwithdraw?: (appId: number) => Promise<void>
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

export function InterestPanel({ open, shift, dayLabel, onClose, onApprove, onUnapprove, onUpdateSlots, readOnlySlots = false, onReject, onUnreject, onUnwithdraw }: Props) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [slots, setSlots] = useState(shift?.slots ?? 5)
  const [slotsInput, setSlotsInput] = useState(String(shift?.slots ?? 5))
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')

  useEffect(() => {
    if (!shift) return
    setSlots(shift.slots)
    setSlotsInput(String(shift.slots))
    fetch(`/api/shifts/${shift.id}`)
      .then(r => r.json())
      .then(d => setApplicants(d.applicants ?? []))
  }, [shift, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const approved = applicants.filter(a => a.approved)
  const pending = applicants.filter(a => !a.approved && !a.rejected && !a.withdrawn)
  const rejected = applicants.filter(a => a.rejected)
  const withdrawn = applicants.filter(a => a.withdrawn && !a.approved)

  const handleApprove = async (appId: number) => {
    await onApprove(appId)
    setApplicants(prev => prev.map(a => a.id === appId ? { ...a, approved: true, withdrawn: false } : a))
  }
  const handleUnapprove = async (appId: number, reason?: string) => {
    await onUnapprove(appId, reason)
    setApplicants(prev => prev.map(a =>
      a.id === appId ? { ...a, approved: false, withdrawn: true, withdrawal_reason: reason ?? null } : a
    ))
    setWithdrawingId(null)
    setWithdrawReason('')
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

        <div className="side-panel-list">
          {/* Approved group */}
          <div className="list-group-h">
            <span>Godkända</span>
            <span>{approved.length} / {slots}</span>
          </div>
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
                      {a.user_phone && <><Phone className="svg-ico svg-ico-sm" />{a.user_phone}</>}
                      <span className="sep">·</span>
                      anmäld {fmtTime(a.applied_at)}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-success"
                      disabled={approved.length >= slots}
                      onClick={() => handleApprove(a.id)}
                    >
                      <Check className="svg-ico svg-ico-sm" />
                      Godkänn
                    </button>
                    {onReject && (
                      <button
                        className="btn btn-sm btn-danger-ghost"
                        onClick={() => { setRejectingId(a.id); setRejectReason('') }}
                      >
                        Neka
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
                      <button className="btn btn-sm btn-danger" onClick={async () => {
                        await onReject(a.id, rejectReason || undefined)
                        setApplicants(prev => prev.map(x => x.id === a.id ? { ...x, rejected: true, rejection_reason: rejectReason || null } : x))
                        setRejectingId(null)
                      }}>
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
                {onUnreject && (
                  <div className="actions">
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={async () => {
                      await onUnreject(a.id)
                      setApplicants(prev => prev.map(x => x.id === a.id ? { ...x, rejected: false, rejection_reason: null } : x))
                    }}>
                      Ångra
                    </button>
                  </div>
                )}
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
                {onUnwithdraw && (
                  <div className="actions">
                    <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={async () => {
                      await onUnwithdraw(a.id)
                      setApplicants(prev => prev.map(x => x.id === a.id ? { ...x, withdrawn: false } : x))
                    }}>
                      Ångra
                    </button>
                  </div>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </>
  )
}
