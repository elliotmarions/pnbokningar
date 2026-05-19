// Swedish public holidays and eves — used server-side to auto-close shifts

function easterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function pad(n: number) { return String(n).padStart(2, '0') }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

// Midsummer eve = Friday between June 19–25
function midsummerEve(year: number): Date {
  for (let d = 19; d <= 25; d++) {
    const date = new Date(year, 5, d)
    if (date.getDay() === 5) return date
  }
  return new Date(year, 5, 19)
}

// All Saints' Day = Saturday Oct 31 – Nov 6
function allSaintsDay(year: number): Date {
  const base = new Date(year, 9, 31)
  for (let i = 0; i <= 6; i++) {
    const d = addDays(base, i)
    if (d.getDay() === 6) return d
  }
  return base
}

export interface HolidayInfo {
  name: string
  type: 'holiday' | 'eve' | 'closed'
}

// Returns the Saturday of a given ISO week
function saturdayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const mondayOffset = (jan4.getDay() + 6) % 7 // days back to Monday
  const week1Mon = new Date(jan4)
  week1Mon.setDate(jan4.getDate() - mondayOffset)
  const targetSat = new Date(week1Mon)
  targetSat.setDate(week1Mon.getDate() + (week - 1) * 7 + 5)
  return targetSat
}

// Weeks 27-32: Saturdays are closed (sommaruppehåll)
function getClosedSaturdays(year: number): Date[] {
  return [27, 28, 29, 30, 31, 32].map(w => saturdayOfIsoWeek(year, w))
}

export function getHolidayMap(year: number): Map<string, HolidayInfo> {
  const m = new Map<string, HolidayInfo>()
  const add = (d: Date, name: string, type: 'holiday' | 'eve' | 'closed') => m.set(fmt(d), { name, type })
  const fixed = (mo: number, day: number, name: string, type: 'holiday' | 'eve' | 'closed') =>
    add(new Date(year, mo - 1, day), name, type)

  // Fixed röda dagar
  fixed(1,  1,  'Nyårsdagen',           'holiday')
  fixed(1,  6,  'Trettondedag jul',     'holiday')
  fixed(5,  1,  'Första maj',           'holiday')
  fixed(6,  6,  'Sveriges nationaldag', 'holiday')
  fixed(12, 25, 'Juldagen',             'holiday')
  fixed(12, 26, 'Annandag jul',         'holiday')

  // Fixed aftnar
  fixed(1,  5,  'Trettondedag jul afton', 'eve')
  fixed(4,  30, 'Valborg',               'eve')
  fixed(12, 24, 'Julafton',              'eve')
  fixed(12, 31, 'Nyårsafton',            'eve')

  // Easter-based
  const easter = easterDate(year)
  add(addDays(easter, -2), 'Långfredagen',           'holiday')
  add(addDays(easter, -1), 'Påskafton',              'eve')
  add(easter,              'Påskdagen',              'holiday')
  add(addDays(easter,  1), 'Annandag påsk',          'holiday')
  add(addDays(easter, 39), 'Kristi himmelsfärdsdag', 'holiday')
  add(addDays(easter, 48), 'Pingstafton',            'eve')
  add(addDays(easter, 49), 'Pingstdagen',            'holiday')

  // Midsummer
  const mids = midsummerEve(year)
  add(mids,              'Midsommarafton', 'eve')
  add(addDays(mids, 1),  'Midsommardagen', 'holiday')

  // All Saints
  add(allSaintsDay(year), 'Alla helgons dag', 'holiday')

  // Closed Saturdays: weeks 27-32 (sommaruppehåll)
  for (const sat of getClosedSaturdays(year)) {
    add(sat, 'Sommarstängt', 'closed')
  }

  return m
}

export function getHolidayInfo(dateStr: string): HolidayInfo | null {
  const year = parseInt(dateStr.slice(0, 4))
  return getHolidayMap(year).get(dateStr) ?? null
}

export function isHolidayOrEve(dateStr: string): boolean {
  return getHolidayInfo(dateStr) !== null
}
