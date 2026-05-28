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
