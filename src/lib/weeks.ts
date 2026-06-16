import { getISOWeek, getISOWeekYear, startOfISOWeek, addDays, format } from 'date-fns'

export interface WeekInfo {
  weekYear: number
  weekNumber: number
  days: { dayIndex: number; date: string; label: string; shortLabel: string; startTime: string; endTime: string }[]
}

const DAY_LABELS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']
const SHORT_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

export function currentWeekInfo(): WeekInfo {
  return weekInfoFor(new Date())
}

export function weekInfoFor(ref: Date): WeekInfo {
  const weekNumber = getISOWeek(ref)
  const weekYear = getISOWeekYear(ref)
  const monday = startOfISOWeek(ref)
  const days = [0, 1, 2, 3, 4, 5].map(i => ({
    dayIndex: i,
    date: format(addDays(monday, i), 'yyyy-MM-dd'),
    label: DAY_LABELS[i],
    shortLabel: SHORT_LABELS[i],
    startTime: i === 5 ? '09:45' : '16:00',
    endTime: i === 5 ? '18:00' : '22:00',
  }))
  return { weekYear, weekNumber, days }
}

export function weekInfoFromNumbers(weekYear: number, weekNumber: number): WeekInfo {
  // Find the Thursday of the ISO week (ISO weeks are defined by their Thursday)
  const jan4 = new Date(weekYear, 0, 4) // Jan 4 is always in week 1
  const week1Monday = startOfISOWeek(jan4)
  const targetMonday = addDays(week1Monday, (weekNumber - 1) * 7)
  return weekInfoFor(targetMonday)
}

export function nextWeekInfo(): WeekInfo {
  return weekInfoFor(addDays(new Date(), 7))
}

/**
 * Time-gate for the weekly auto-open. Accepts any Wednesday 18:00–22:59
 * Stockholm time — a deliberately permissive window because Vercel cron timing
 * is best-effort and can be delayed; a strict `hour === 18` check would silently
 * skip the whole week if a trigger landed even an hour late. `force` bypasses
 * the check for manual runs.
 *
 * Pure function extracted from the open-week cron route so it can be unit-tested
 * (this is exactly the logic behind the missed-auto-open bug).
 */
export function shouldAutoOpen(weekday: string, hour: number, force: boolean): boolean {
  if (force) return true
  return weekday === 'Wednesday' && hour >= 18 && hour <= 22
}

export function formatSwedishDate(dateStr: string): string {
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

export function formatSwedishDateLong(dateStr: string): string {
  const months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${months[d.getMonth()]}`
}

export function shiftHours(dayIndex: number): { start: string; end: string; durationH: number } {
  if (dayIndex === 5) return { start: '09:45', end: '18:00', durationH: 8.25 }
  return { start: '16:00', end: '22:00', durationH: 6 }
}

export function dayLabelFull(dayIndex: number): string {
  return DAY_LABELS[dayIndex]
}

// Default number of permanent staff (fastanställda) working each weekday,
// indexed by dayIndex (0 = Monday … 5 = Saturday). This is the baseline every
// week starts from; admins can override a single day in a single week from the
// Schemalägg page (stored on the shift). Normal operating-day figures — red
// days / closed days fall back to 0 (see resolvePermanentStaff).
const PERMANENT_STAFF_DEFAULT = [12, 32, 26, 26, 26, 26]

export function permanentStaffDefault(dayIndex: number): number {
  return PERMANENT_STAFF_DEFAULT[dayIndex] ?? 0
}

// Effective permanent-staff count for a day: the per-week override if one was
// set, otherwise the weekday default. A red day / eve has no permanent staff,
// so the default collapses to 0 there (an explicit override still wins).
export function resolvePermanentStaff(
  override: number | null | undefined,
  dayIndex: number,
  isHoliday: boolean,
): number {
  if (override != null) return override
  return isHoliday ? 0 : permanentStaffDefault(dayIndex)
}
