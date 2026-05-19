'use client'
import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from './Icons'

interface HolidayInfo {
  name: string
  type: 'holiday' | 'eve' | 'closed'
}

interface CustomClosedDay {
  id: number
  date: string
  reason: string
  color: string
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

function shiftDate(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
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
    const d = shiftDate(base, i)
    if (d.getDay() === 6) return d
  }
  return base
}

// Returns the Saturday of a given ISO week
function saturdayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  const mondayOffset = (jan4.getDay() + 6) % 7
  const week1Mon = new Date(jan4)
  week1Mon.setDate(jan4.getDate() - mondayOffset)
  const targetSat = new Date(week1Mon)
  targetSat.setDate(week1Mon.getDate() + (week - 1) * 7 + 5)
  return targetSat
}

function getSwedishHolidays(year: number): Record<string, HolidayInfo> {
  const map: Record<string, HolidayInfo> = {}
  const add = (date: Date, name: string, type: 'holiday' | 'eve' | 'closed') => {
    map[toKey(date)] = { name, type }
  }
  const fixed = (m: number, d: number, name: string, type: 'holiday' | 'eve' | 'closed') =>
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
  add(shiftDate(easter, -2), 'Långfredagen',          'holiday')
  add(shiftDate(easter, -1), 'Påskafton',             'eve')
  add(easter,                 'Påskdagen',             'holiday')
  add(shiftDate(easter,  1), 'Annandag påsk',         'holiday')
  add(shiftDate(easter, 39), 'Kristi himmelsfärdsdag','holiday')
  add(shiftDate(easter, 48), 'Pingstafton',           'eve')
  add(shiftDate(easter, 49), 'Pingstdagen',           'holiday')

  // Midsummer
  const midsEve = getMidsummerEve(year)
  add(midsEve,               'Midsommarafton',  'eve')
  add(shiftDate(midsEve, 1), 'Midsommardagen',  'holiday')

  // All Saints
  add(getAllSaintsDay(year), 'Alla helgons dag', 'holiday')

  // Closed Saturdays: weeks 27-32 (sommaruppehåll)
  for (let w = 27; w <= 32; w++) {
    add(saturdayOfIsoWeek(year, w), 'Sommarstängt', 'closed')
  }

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
  year, month, holidays, customClosedMap, todayKey,
}: {
  year: number
  month: number
  holidays: Record<string, HolidayInfo>
  customClosedMap: Record<string, CustomClosedDay>
  todayKey: string
}) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset = (firstDay.getDay() + 6) % 7

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
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
          const c = customClosedMap[key]
          const isToday = key === todayKey
          const isSun = idx % 7 === 6

          if (c) {
            const cls = ['cal-cell', 'ccd-cell', isToday ? 'today' : ''].filter(Boolean).join(' ')
            return (
              <div key={idx} className={cls} title={c.reason}
                style={{ background: hexToRgba(c.color, 0.2), color: c.color, fontWeight: 700 }}>
                {day}
              </div>
            )
          }

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
  const [customClosed, setCustomClosed] = useState<CustomClosedDay[]>([])
  const [newDate, setNewDate] = useState('')
  const [newReason, setNewReason] = useState('')
  const [newColor, setNewColor] = useState('#EF4444')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/custom-closed')
      .then(r => r.json())
      .then(data => setCustomClosed(data.days ?? []))
  }, [])

  const holidays = getSwedishHolidays(year)
  const todayKey = toKey(new Date())

  // Build map for current year (for MonthCard)
  const customClosedMap: Record<string, CustomClosedDay> = {}
  customClosed
    .filter(d => d.date.startsWith(String(year)))
    .forEach(d => { customClosedMap[d.date] = d })

  const sorted = Object.entries(holidays).sort(([a], [b]) => a.localeCompare(b))
  const redDays    = sorted.filter(([, h]) => h.type === 'holiday')
  const eveDays    = sorted.filter(([, h]) => h.type === 'eve')
  const closedDays = sorted.filter(([, h]) => h.type === 'closed')
  const yearCustomClosed = customClosed
    .filter(d => d.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date))

  async function handleAdd() {
    if (!newDate || !newReason.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/custom-closed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, reason: newReason.trim(), color: newColor }),
      })
      if (res.ok) {
        const data = await res.json()
        setCustomClosed(prev =>
          [...prev.filter(d => d.date !== data.day.date), data.day]
            .sort((a, b) => a.date.localeCompare(b.date))
        )
        setNewDate('')
        setNewReason('')
        setNewColor('#EF4444')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/custom-closed/${id}`, { method: 'DELETE' })
    setCustomClosed(prev => prev.filter(d => d.id !== id))
  }

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
          <div className="cal-legend-item"><span className="cal-dot closed" />Sommarstängt</div>
        </div>
      </div>

      {/* 12-month grid */}
      <div className="cal-months">
        {Array.from({ length: 12 }, (_, i) => (
          <MonthCard
            key={i} year={year} month={i}
            holidays={holidays}
            customClosedMap={customClosedMap}
            todayKey={todayKey}
          />
        ))}
      </div>

      {/* Holiday + closed day lists */}
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
          <div>
            <div className="cal-list-heading">
              <span className="cal-dot closed" />
              Sommarstängt ({closedDays.length} st)
            </div>
            <div className="cal-list-rows">
              {closedDays.map(([key, h]) => (
                <div key={key} className="cal-list-row closed">
                  <span className="cal-row-date">{fmtKey(key)}</span>
                  <span className="cal-row-name">{h.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Custom closed days ── */}
      <div className="ccd-section">
        <div className="ccd-section-heading">Egna stängda dagar</div>

        {/* Add form */}
        <div className="ccd-form">
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="ccd-date-input"
          />
          <input
            type="text"
            value={newReason}
            onChange={e => setNewReason(e.target.value)}
            placeholder="Anledning, t.ex. Personaldag..."
            className="ccd-reason-input"
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <label className="ccd-color-wrap" title="Välj färg">
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="ccd-color-input"
            />
            <span className="ccd-color-preview" style={{ background: newColor }} />
          </label>
          <button
            className="btn-primary ccd-add-btn"
            onClick={handleAdd}
            disabled={saving || !newDate || !newReason.trim()}
          >
            {saving ? 'Sparar…' : '+ Lägg till'}
          </button>
        </div>

        {/* List */}
        {yearCustomClosed.length === 0 ? (
          <div className="ccd-empty">Inga egna stängda dagar för {year}</div>
        ) : (
          <div className="ccd-list">
            {yearCustomClosed.map(d => (
              <div key={d.id} className="ccd-row">
                <span className="ccd-dot" style={{ background: d.color }} />
                <span className="ccd-date">{fmtKey(d.date)}</span>
                <span className="ccd-reason">{d.reason}</span>
                <button className="ccd-delete-btn" onClick={() => handleDelete(d.id)} title="Ta bort">
                  <Trash2 className="svg-ico" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
