import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { shiftRepo, customClosedRepo, getDb } from '@/lib/db'
import { int, fieldError } from '@/lib/validate'
import { getHolidayInfo } from '@/lib/holidays'
import { sendPushToAllDrivers } from '@/lib/push'

export async function PUT(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Ogiltig JSON.' }, { status: 400 }) }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 7) {
    return NextResponse.json({ error: 'body måste vara en array med 1–7 pass.' }, { status: 400 })
  }

  const body: { id: number; is_open?: number; slots?: number; permanent_staff?: number | null; is_full?: number }[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return NextResponse.json({ error: 'Ogiltigt pass.' }, { status: 400 })
    const r = item as Record<string, unknown>
    const id = int(r.id, { min: 1 })
    if (id === null) return NextResponse.json(fieldError('id'), { status: 400 })
    const is_open_val = r.is_open !== undefined ? int(r.is_open, { min: 0, max: 1 }) : undefined
    const slots_val = r.slots !== undefined ? int(r.slots, { min: 1, max: 50 }) : undefined
    const is_full_val = r.is_full !== undefined ? int(r.is_full, { min: 0, max: 1 }) : undefined
    if (r.is_open !== undefined && is_open_val === null) return NextResponse.json(fieldError('is_open'), { status: 400 })
    if (r.slots !== undefined && slots_val === null) return NextResponse.json(fieldError('slots'), { status: 400 })
    if (r.is_full !== undefined && is_full_val === null) return NextResponse.json(fieldError('is_full'), { status: 400 })
    // permanent_staff: null resets to the weekday default; a number (0–200) overrides it.
    let permanent_val: number | null | undefined
    if (r.permanent_staff === null) {
      permanent_val = null
    } else if (r.permanent_staff !== undefined) {
      permanent_val = int(r.permanent_staff, { min: 0, max: 200 })
      if (permanent_val === null) return NextResponse.json(fieldError('permanent_staff'), { status: 400 })
    }
    body.push({ id, is_open: is_open_val ?? undefined, slots: slots_val ?? undefined, permanent_staff: permanent_val, is_full: is_full_val ?? undefined })
  }

  // Batch-fetch all shift dates in one round-trip
  const sql = getDb()
  const ids = body.map(b => b.id)
  const rows = await sql<{ id: number; date: string; week_year: number; week_number: number }[]>`
    SELECT id, date, week_year, week_number FROM shifts WHERE id IN ${sql(ids)}
  `
  const dateById = new Map(rows.map(r => [r.id, r.date]))
  const weekById = new Map(rows.map(r => [r.id, { year: r.week_year, number: r.week_number }]))

  // Block opening shifts that fall on a holiday/eve or custom-closed day.
  // Check holidays locally + batch-fetch custom-closed for all relevant dates.
  const openingDates = body
    .filter(s => s.is_open === 1)
    .map(s => dateById.get(s.id))
    .filter((d): d is string => !!d)

  if (openingDates.length > 0) {
    const closedDates = await customClosedRepo.forDates(openingDates)
    for (const d of openingDates) {
      if (getHolidayInfo(d) || closedDates.has(d)) {
        return NextResponse.json({
          error: 'Den här dagen är låst (röd dag, afton eller stängd dag) och kan inte öppnas.',
        }, { status: 400 })
      }
    }
  }

  // Run all updates in parallel
  await Promise.all(body.map(s => shiftRepo.update(s.id, { is_open: s.is_open, slots: s.slots, permanent_staff: s.permanent_staff, is_full: s.is_full })))

  // Auto-apply long-term bookings to opened shifts (in parallel)
  const { applyLongTermToShift } = await import('@/lib/apply-long-term')
  const adminId = (session.user as Record<string, unknown>).id as string
  await Promise.all(
    body
      .filter(s => s.is_open === 1)
      .map(s => {
        const date = dateById.get(s.id)
        return date ? applyLongTermToShift(s.id, date, adminId) : Promise.resolve()
      })
  )

  // Optionally broadcast a "new shifts open" push to all drivers. Opt-in via
  // ?notify=1 — used when an admin opens a week/day manually and wants drivers
  // pinged the same way the weekly auto-open does. Only fires when shifts were
  // actually opened. Best-effort: a push failure must not fail the open itself.
  const notify = new URL(req.url).searchParams.get('notify') === '1'
  const openedIds = body.filter(s => s.is_open === 1).map(s => s.id)
  if (notify && openedIds.length > 0) {
    const week = weekById.get(openedIds[0])
    try {
      await sendPushToAllDrivers({
        title: 'Nya pass öppna! 📅',
        body: openedIds.length === 1
          ? 'Ett nytt pass har öppnats för bokning. Säkra din plats!'
          : `Vecka ${week?.number} är nu öppen för bokning. Säkra dina pass!`,
        url: '/',
        tag: week ? `week-open-${week.year}-${week.number}` : 'week-open',
      })
    } catch (err) {
      console.error('[shifts] notify broadcast failed', err)
    }
  }

  return NextResponse.json({ ok: true })
}
