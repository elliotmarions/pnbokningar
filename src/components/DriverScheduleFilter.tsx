'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from './Icons'

interface Applicant { user_id: string; approved: boolean | number; reserve: number }

/**
 * Driver search used in the week views (Översikt + Schemalägg). Pick a driver
 * and the days they're booked in the currently-viewed week are reported back
 * via `onChange` (a set of shift ids) so the parent can highlight those cards.
 * Purely client-side — uses the applicant data the parent already has.
 */
export function DriverScheduleFilter({
  drivers,
  applicantsByShift,
  shifts,
  days,
  onChange,
}: {
  drivers: { id: string; name: string }[]
  applicantsByShift: Record<number, unknown[]>
  shifts: { id: number; day_index: number }[]
  days: { dayIndex: number; label: string }[]
  // null = no driver selected (parent should not dim anything); a Set (possibly
  // empty) = a driver is selected and these are the shifts they work.
  onChange: (highlighted: Set<number> | null) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = drivers.find(d => d.id === selectedId) ?? null

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || selected) return []
    return drivers.filter(d => d.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query, drivers, selected])

  // Shift ids (in the current week) the selected driver is booked/approved for.
  const bookedShiftIds = useMemo(() => {
    const set = new Set<number>()
    if (!selectedId) return set
    for (const s of shifts) {
      const apps = (applicantsByShift[s.id] ?? []) as Applicant[]
      if (apps.some(a => a.user_id === selectedId && Boolean(a.approved) && !a.reserve)) set.add(s.id)
    }
    return set
  }, [selectedId, shifts, applicantsByShift])

  useEffect(() => { onChange(selectedId ? bookedShiftIds : null) }, [selectedId, bookedShiftIds, onChange])

  // Booked day labels in week order, for the summary line.
  const bookedDayLabels = useMemo(() => {
    const idxs = new Set(shifts.filter(s => bookedShiftIds.has(s.id)).map(s => s.day_index))
    return days.filter(d => idxs.has(d.dayIndex)).map(d => d.label)
  }, [bookedShiftIds, shifts, days])

  const pick = (d: { id: string; name: string }) => { setSelectedId(d.id); setQuery(d.name); setFocused(false) }
  const clear = () => { setSelectedId(null); setQuery('') }

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="driver-filter" ref={wrapRef}>
      <div className="driver-filter-input">
        <Search className="svg-ico svg-ico-sm" />
        <input
          placeholder="Sök chaufför…"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedId(null); setFocused(true) }}
          onFocus={() => setFocused(true)}
        />
        {(selected || query) && (
          <button className="driver-filter-clear" onClick={clear} title="Rensa" type="button">
            <X className="svg-ico svg-ico-sm" />
          </button>
        )}
        {focused && matches.length > 0 && (
          <div className="driver-filter-list">
            {matches.map(d => (
              <button key={d.id} className="driver-filter-row" onClick={() => pick(d)} type="button">
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="driver-filter-summary">
          {bookedDayLabels.length > 0
            ? <><strong>{selected.name}</strong> jobbar denna vecka: {bookedDayLabels.join(', ')}</>
            : <><strong>{selected.name}</strong> jobbar inga pass denna vecka.</>}
        </div>
      )}
    </div>
  )
}
