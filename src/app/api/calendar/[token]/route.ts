import { NextRequest, NextResponse } from 'next/server'
import { userRepo, getDb } from '@/lib/db'
import { shiftHours } from '@/lib/weeks'
import { buildICS, type CalendarEvent } from '@/lib/ical'

/**
 * Public, tokenized calendar feed of a driver's confirmed shifts.
 * The token IS the auth — no session needed (calendar apps can't log in).
 * Only exposes the driver's own shift dates/times; no names or phone numbers.
 *
 * URL ends in ".ics" for app compatibility; we strip it to get the token.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token
  const token = raw.replace(/\.ics$/i, '')

  const user = await userRepo.getByCalendarToken(token)
  if (!user) return new NextResponse('Not found', { status: 404 })

  // Include shifts from 60 days ago onward so recent history stays visible.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 60)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

  const sql = getDb()
  const rows = await sql<{ id: number; date: string; day_index: number }[]>`
    SELECT a.id, s.date, s.day_index
    FROM approvals ap
    JOIN applications a ON a.id = ap.application_id
    JOIN shifts s ON s.id = a.shift_id
    WHERE a.user_id = ${user.id} AND a.withdrawn = 0 AND a.rejected = 0
      AND s.date >= ${cutoffStr}
    ORDER BY s.date
  `

  const events: CalendarEvent[] = rows.map(r => {
    const { start, end } = shiftHours(r.day_index)
    return {
      uid: `shift-${r.id}@pnbokningar`,
      date: r.date,
      startTime: start,
      endTime: end,
      summary: 'Pass – PostNord',
      location: 'PostNord',
    }
  })

  const ics = buildICS(events, 'PostNord – Mina pass')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="mina-pass.ics"',
      // Let calendar apps re-poll without hammering the DB.
      'Cache-Control': 'public, max-age=900',
    },
  })
}
