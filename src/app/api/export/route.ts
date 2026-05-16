import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import ExcelJS from 'exceljs'

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? '2020-01-01'
  const to = searchParams.get('to') ?? '2099-12-31'
  const group = searchParams.get('group') ?? 'driver'
  const sql = getDb()

  const wb = new ExcelJS.Workbook()
  wb.creator = 'PostNord Passbokning'

  if (group === 'driver') {
    const rows = await sql<{ name: string; shifts: number; last_shift: string }[]>`
      SELECT u.name, COUNT(ap.id)::int AS shifts, MAX(s.date) AS last_shift
      FROM approvals ap
      JOIN applications a ON a.id = ap.application_id
      JOIN shifts s ON s.id = a.shift_id
      JOIN users u ON u.id = a.user_id
      WHERE s.date BETWEEN ${from} AND ${to}
      GROUP BY u.id, u.name
      ORDER BY u.name
    `

    const ws = wb.addWorksheet('Per chaufför')
    ws.columns = [
      { header: 'Namn', key: 'name', width: 28 },
      { header: 'Antal pass', key: 'shifts', width: 12 },
      { header: 'Senaste pass', key: 'last_shift', width: 16 },
    ]
    styleHeaderRow(ws)
    rows.forEach(r => ws.addRow(r))

    const detail = await sql<{ name: string; date: string; day_index: number; approved_at: string }[]>`
      SELECT u.name, s.date, s.day_index, (ap.approved_at AT TIME ZONE 'Europe/Stockholm')::text AS approved_at
      FROM approvals ap
      JOIN applications a ON a.id = ap.application_id
      JOIN shifts s ON s.id = a.shift_id
      JOIN users u ON u.id = a.user_id
      WHERE s.date BETWEEN ${from} AND ${to}
      ORDER BY u.name, s.date
    `

    const ws2 = wb.addWorksheet('Detaljerade pass')
    ws2.columns = [
      { header: 'Namn', key: 'name', width: 28 },
      { header: 'Datum', key: 'date', width: 14 },
      { header: 'Dag', key: 'day', width: 12 },
      { header: 'Arbetstid', key: 'hours', width: 16 },
    ]
    styleHeaderRow(ws2)
    const dayNames = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']
    detail.forEach(r => ws2.addRow({
      name: r.name,
      date: r.date,
      day: dayNames[r.day_index],
      hours: r.day_index === 5 ? '09:45–16:30' : '16:00–22:00',
    }))
  } else {
    const rows = await sql<{ week_year: number; week_number: number; shifts: number; drivers: number; last_date: string }[]>`
      SELECT s.week_year, s.week_number,
             COUNT(ap.id)::int AS shifts,
             COUNT(DISTINCT a.user_id)::int AS drivers,
             MAX(s.date) AS last_date
      FROM approvals ap
      JOIN applications a ON a.id = ap.application_id
      JOIN shifts s ON s.id = a.shift_id
      WHERE s.date BETWEEN ${from} AND ${to}
      GROUP BY s.week_year, s.week_number
      ORDER BY s.week_year, s.week_number
    `

    const ws = wb.addWorksheet('Per vecka')
    ws.columns = [
      { header: 'År', key: 'week_year', width: 8 },
      { header: 'Vecka', key: 'week_number', width: 10 },
      { header: 'Antal pass', key: 'shifts', width: 12 },
      { header: 'Unika chaufförer', key: 'drivers', width: 18 },
      { header: 'Senaste datum', key: 'last_date', width: 16 },
    ]
    styleHeaderRow(ws)
    rows.forEach(r => ws.addRow(r))
  }

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="passbokning-export-${from}-${to}.xlsx"`,
    },
  })
}

function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1)
  row.font = { bold: true }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF21262D' } }
  row.commit()
}
