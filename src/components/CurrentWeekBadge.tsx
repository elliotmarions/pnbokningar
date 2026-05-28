'use client'
import { useEffect, useState } from 'react'

/**
 * Small pill showing the real-world current ISO week ("Vecka 23"). Computed
 * client-side in an effect so it never causes an SSR/hydration mismatch.
 */
function currentIsoWeek() {
  const tmp = new Date()
  tmp.setHours(0, 0, 0, 0)
  // Thursday of the current week determines the ISO year/week.
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const isoYear = tmp.getFullYear()
  const firstThursday = new Date(isoYear, 0, 4)
  const isoWeek = Math.round(
    ((tmp.getTime() - firstThursday.getTime()) / 86400000 +
      ((firstThursday.getDay() + 6) % 7)) / 7
  ) + 1
  return { isoYear, isoWeek }
}

export function CurrentWeekBadge({ className = '' }: { className?: string }) {
  const [week, setWeek] = useState<number | null>(null)

  useEffect(() => {
    setWeek(currentIsoWeek().isoWeek)
  }, [])

  if (week === null) return null

  return (
    <span className={`current-week-badge ${className}`} title="Nuvarande vecka">
      Vecka {week}
    </span>
  )
}
