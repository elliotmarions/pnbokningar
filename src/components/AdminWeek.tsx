'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, ChevronLeft, ChevronRight, FileSpreadsheet } from './Icons'
import { Toast, useToast } from './Toast'

interface Shift {
  id: number
  day_index: number
  date: string
  is_open: number
  slots: number
  approved: number
  pending: number
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

export function AdminWeek() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekYear, setWeekYear] = useState(0)
  const [weekNumber, setWeekNumber] = useState(0)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [days, setDays] = useState<DayInfo[]>([])
  const { toast, show: showToast, clear: clearToast } = useToast()

  const load = useCallback(async (offset: number) => {
    const base = new Date()
    base.setDate(base.getDate() + offset * 7)
    const tmp = new Date(base); tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const isoYear = tmp.getFullYear()
    const isoWeek = Math.round(((tmp.getTime() - new Date(isoYear, 0, 4).getTime()) / 86400000 + (new Date(isoYear, 0, 4).getDay() + 6) % 7) / 7) + 1
    const res = await fetch(`/api/weeks?year=${isoYear}&week=${isoWeek}`)
    if (!res.ok) return
    const data = await res.json()
    setWeekYear(data.weekYear)
    setWeekNumber(data.weekNumber)
    setShifts(data.shifts)
    setDays(data.days)
  }, [])

  useEffect(() => { load(weekOffset) }, [weekOffset, load])

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

      <div className="week-grid">
        {days.map(day => {
          const shift = shifts.find(s => s.day_index === day.dayIndex)
          if (!shift) return null
          const c = { approved: shift.approved ?? 0, pending: shift.pending ?? 0 }
          const pct = shift.slots > 0 ? Math.min(100, (c.approved / shift.slots) * 100) : 0
          const isFull = c.approved >= shift.slots
          const badgeClass = !shift.is_open ? 'b-closed' : isFull ? 'b-full' : 'b-open'
          const badgeLabel = !shift.is_open ? 'Stängd' : isFull ? 'Fullbokad' : 'Öppen'

          return (
            <div
              key={day.dayIndex}
              className={`wk-card ${!shift.is_open ? 'is-closed' : ''}`}
            >
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
              </div>
            </div>
          )
        })}
      </div>

      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
    </>
  )
}
