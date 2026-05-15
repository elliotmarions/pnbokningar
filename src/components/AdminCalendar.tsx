'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from './Icons'

interface HolidayInfo {
  name: string
  type: 'holiday' | 'eve'
}

// Meeus/Jones/Butcher Easter algorithm
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

function shift(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Midsummer eve = Friday between June 19–25
function getMidsummerEve(year: number): Date {
  for (let d = 19; d <= 25; d++) {
    const date = new Date(year, 5, d)
    if (date.getDay() === 5) return date
  }
  return new Date(year, 5, 19)
}

// All Saints' Day = Saturday between Oct 31 – Nov 6
function getAllSaintsDay(year: number): Date {
  const base = new Date(year, 9, 31)
  for (let i = 0; i <= 6; i++) {
    const d = shift(base, i)
    if (d.getDay() === 6) return d
  }
  return base
}

function getSwedishHolidays(year: number): Record<string, HolidayInfo> {
  const map: Record<string, HolidayInfo> = {}
  const add = (date: Date, name: string, type: 'holiday' | 'eve') => {
    map[toKey(date)] = { name, type }
  }
  const fixed = (m: number, d: number, name: string, type: 'holiday' | 'eve') =>
    add(new Date(year, m - 1, d), name, type)

  // Fixed dates
  fixed(1,  1,  'Nyårsdagen',              'holiday')
  fixed(1,  5,  'Trettondedag jul afton',  'eve')
  fixed(1,  6,  'Trettondedag jul',        'holiday')
  fixed(4,  30, 'Valborg',                 'eve')
  fixed(5,  1,  'Första maj',              'holiday')
  fixed(6,  6,  'Sveriges nationaldag',    'holiday')
  fixed(12, 24, 'Julafton',                'eve')
  fixed(12, 25, 'Juldagen',                'holiday')
  fixed(12, 26, 'Annandag jul',            'holiday')
  fixed(12, 31, 'Nyårsafton',              'eve')

  // Easter-based
  const easter = easterDate(year)
  add(shift(easter, -2), 'Långfredagen',          'holiday')
  add(shift(easter, -1), 'Påskafton',             'eve')
  add(easter,             'Påskdagen',             'holiday')
  add(shift(easter,  1), 'Annandag påsk',         'holiday')
  add(shift(easter, 39), 'Kristi himmelsfärdsdag','holiday')
  add(shift(easter, 48), 'Pingstafton',           'eve')
  add(shift(easter, 49), 'Pingstdagen',           'holiday')

  // Midsummer
  const midsEve = getMidsummerEve(year)
  add(midsEve,         'Midsommarafton',  'eve')
  add(shift(midsEve, 1), 'Midsommardagen', 'holiday')

  // All Saints
  add(getAllSaintsDay(year), 'Alla helgons dag', 'holiday')

  return map
}

const MONTH_NAMES = [
  'Januari','Februari','Mars','April','Maj','Juni',
  'Juli','Augusti','September','Oktober','November','December',
]
const DAY_NAMES = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön']

const LONG_MONTHS: Record<string, string> = {
  '01': 'januari', '02': 'februari', '03': 'mars', '04': 'april',
  '05': 'maj', '06': 'juni', '07': 'juli', '08': 'augusti',
  '09': 'september', '10': 'oktober', '11': 'november', '12': 'december',
}

function fmtKey(key: string) {
  const [, mm, dd] = key.split('-')
  return `${parseInt(dd)} ${LONG_MONTHS[mm]}`
}

function MonthCard({
  year, month, holidays, todayKey,
}: {
  year: number; month: number; holidays: Record<string, HolidayInfo>; todayKey: string
}) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Monday-first offset (JS: 0=Sun → 6, 1=Mon → 0, ...)
  const offset = (firstDay.getDay() + 6) % 7

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="cal-month">
      <div className="cal-month-name">{MONTH_NAMES[month]}</div>
      <div className="cal-day-names">
        {DAY_NAMES.map(n => (
          <div key={n} className={`cal-dn${n === 'Sön' ? ' sun' : ''}`}>{n}</div>
        ))}
      </div>
      <div className="cal-days">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="cal-cell empty" />
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const h = holidays[key]
          const isToday = key === todayKey
          const isSun = idx % 7 === 6
          const cls = ['cal-cell',
            h ? h.type : '',
            isToday ? 'today' : '',
            (!h && isSun) ? 'sunday' : '',
          ].filter(Boolean).join(' ')
          return (
            <div key={idx} className={cls} title={h?.name}>
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AdminCalendar() {
  const [year, setYear] = useState(new Date().getFullYear())
  const holidays = getSwedishHolidays(year)
  const todayKey = toKey(new Date())

  const sorted = Object.entries(holidays).sort(([a], [b]) => a.localeCompare(b))
  const redDays  = sorted.filter(([, h]) => h.type === 'holiday')
  const eveDays  = sorted.filter(([, h]) => h.type === 'eve')

  return (
    <div className="cal-root">
      {/* Year nav */}
      <div className="cal-year-nav">
        <button className="arrow" onClick={() => setYear(y => y - 1)}>
          <ChevronLeft className="svg-ico" />
        </button>
        <span className="cal-year-label">{year}</span>
        <button className="arrow" onClick={() => setYear(y => y + 1)}>
          <ChevronRight className="svg-ico" />
        </button>
        <div className="cal-legend">
          <div className="cal-legend-item"><span className="cal-dot holiday" />Röd dag</div>
          <div className="cal-legend-item"><span className="cal-dot eve" />Afton</div>
        </div>
      </div>

      {/* 12-month grid */}
      <div className="cal-months">
        {Array.from({ length: 12 }, (_, i) => (
          <MonthCard key={i} year={year} month={i} holidays={holidays} todayKey={todayKey} />
        ))}
      </div>

      {/* Holiday list */}
      <div className="cal-list-section">
        <div className="cal-list-cols">
          <div>
            <div className="cal-list-heading">
              <span className="cal-dot holiday" />
              Röda dagar ({redDays.length} st)
            </div>
            <div className="cal-list-rows">
              {redDays.map(([key, h]) => (
                <div key={key} className="cal-list-row holiday">
                  <span className="cal-row-date">{fmtKey(key)}</span>
                  <span className="cal-row-name">{h.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="cal-list-heading">
              <span className="cal-dot eve" />
              Aftnar ({eveDays.length} st)
            </div>
            <div className="cal-list-rows">
              {eveDays.map(([key, h]) => (
                <div key={key} className="cal-list-row eve">
                  <span className="cal-row-date">{fmtKey(key)}</span>
                  <span className="cal-row-name">{h.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
