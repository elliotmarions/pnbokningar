// Minimal iCalendar (.ics) builder for a driver's confirmed shifts.
// Uses floating local time (no timezone suffix) — calendar apps interpret it
// as the device's local time, which for Swedish drivers is correct and avoids
// all DST/timezone-conversion bugs.

export interface CalendarEvent {
  uid: string        // stable unique id (e.g. "shift-1234@pnbokningar")
  date: string       // YYYY-MM-DD
  startTime: string  // HH:MM
  endTime: string    // HH:MM
  summary: string
  description?: string
  location?: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// "2026-06-02" + "16:00" → "20260602T160000" (floating local time)
function toICSLocal(date: string, time: string): string {
  const [y, m, d] = date.split('-')
  const [hh, mm] = time.split(':')
  return `${y}${m}${d}T${pad(Number(hh))}${pad(Number(mm))}00`
}

function nowStampUTC(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// Escape per RFC 5545 (commas, semicolons, backslashes, newlines).
function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildICS(events: CalendarEvent[], calendarName = 'Mina pass'): string {
  const stamp = nowStampUTC()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PostNord Passbokning//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Stockholm',
  ]

  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${toICSLocal(e.date, e.startTime)}`)
    lines.push(`DTEND:${toICSLocal(e.date, e.endTime)}`)
    lines.push(`SUMMARY:${esc(e.summary)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    lines.push('STATUS:CONFIRMED')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  // RFC 5545 requires CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}
