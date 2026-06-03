'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from './Icons'

interface Applicant {
  user_id: string
  approved: boolean | number
  reserve: number
  rejected?: boolean | number
  withdrawn?: boolean | number
}

// Reported back to the parent so it can highlight the selected driver's days:
//   booked  = approved (and not on the reserve list)
//   applied = applied and still waiting (not approved/rejected/withdrawn/reserve)
export interface DriverHighlight { booked: Set<number>; applied: Set<number> }

/**
 * Driver search used in the week views (Översikt + Schemalägg). Pick a driver
 * and the days they're booked OR have applied for in the currently-viewed week
 * are reported back via `onChange` so the parent can highlight those cards.
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
  // null = no driver selected (parent should not dim anything); an object (with
  // possibly-empty sets) = a driver is selected and these are their shifts.
  onChange: (highlighted: DriverHighlight | null) => void
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

  // Shift ids (in the current week) the selected driver is booked for vs has
  // applied for (still waiting). One application row per shift, so each shift
  // falls into at most one bucket.
  const { bookedShiftIds, appliedShiftIds } = useMemo(() => {
    const booked = new Set<number>()
    const applied = new Set<number>()
    if (!selectedId) return { bookedShiftIds: booked, appliedShiftIds: applied }
    for (const s of shifts) {
      const apps = (applicantsByShift[s.id] ?? []) as Applicant[]
      const mine = apps.find(a => a.user_id === selectedId)
      if (!mine) continue
      if (Boolean(mine.approved) && !mine.reserve) {
        booked.add(s.id)
      } else if (!mine.reserve && !Boolean(mine.rejected) && !Boolean(mine.withdrawn)) {
        applied.add(s.id)
      }
    }
    return { bookedShiftIds: booked, appliedShiftIds: applied }
  }, [selectedId, shifts, applicantsByShift])

  useEffect(() => {
    onChange(selectedId ? { booked: bookedShiftIds, applied: appliedShiftIds } : null)
  }, [selectedId, bookedShiftIds, appliedShiftIds, onChange])

  // Day labels in week order, for the summary lines.
  const labelsFor = (ids: Set<number>) => {
    const idxs = new Set(shifts.filter(s => ids.has(s.id)).map(s => s.day_index))
    return days.filter(d => idxs.has(d.dayIndex)).map(d => d.label)
  }
  const bookedDayLabels = useMemo(() => labelsFor(bookedShiftIds), [bookedShiftIds, shifts, days]) // eslint-disable-line react-hooks/exhaustive-deps
  const appliedDayLabels = useMemo(() => labelsFor(appliedShiftIds), [appliedShiftIds, shifts, days]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <strong>{selected.name}</strong>
          {bookedDayLabels.length === 0 && appliedDayLabels.length === 0 ? (
            <> jobbar eller söker inga pass denna vecka.</>
          ) : (
            <>
              {bookedDayLabels.length > 0 && (
                <div className="dfs-line"><span className="dfs-dot dfs-dot-booked" />Jobbar: {bookedDayLabels.join(', ')}</div>
              )}
              {appliedDayLabels.length > 0 && (
                <div className="dfs-line"><span className="dfs-dot dfs-dot-applied" />Sökt: {appliedDayLabels.join(', ')}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
