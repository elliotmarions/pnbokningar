import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { weekInfoFromNumbers } from '@/lib/weeks'
import ExcelJS from 'exceljs'

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const weekYear = parseInt(searchParams.get('year') ?? '0')
  const weekNumber = parseInt(searchParams.get('week') ?? '0')

  if (!weekYear || !weekNumber) return NextResponse.json({ error: 'year and week required' }, { status: 400 })

  const info = weekInfoFromNumbers(weekYear, weekNumber)
  const sql = getDb()

  // Approved drivers
  const approvedRows = await sql<{ day_index: number; name: string }[]>`
    SELECT s.day_index, u.name
    FROM approvals ap
    JOIN applications a ON a.id = ap.application_id
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE s.week_year = ${weekYear} AND s.week_number = ${weekNumber}
    ORDER BY s.day_index, u.name
  `

  // Reserve drivers (reserve = 1, not approved, not rejected, not withdrawn)
  const reserveRows = await sql<{ day_index: number; name: string }[]>`
    SELECT s.day_index, u.name
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE s.week_year = ${weekYear}
      AND s.week_number = ${weekNumber}
      AND a.reserve = 1
      AND a.rejected = 0
      AND a.withdrawn = 0
      AND ap.id IS NULL
    ORDER BY s.day_index, a.applied_at
  `

  const approvedByDay = new Map<number, string[]>()
  for (const r of approvedRows) {
    if (!approvedByDay.has(r.day_index)) approvedByDay.set(r.day_index, [])
    approvedByDay.get(r.day_index)!.push(r.name)
  }
  const reservesByDay = new Map<number, string[]>()
  for (const r of reserveRows) {
    if (!reservesByDay.has(r.day_index)) reservesByDay.set(r.day_index, [])
    reservesByDay.get(r.day_index)!.push(r.name)
  }

  // Surname, firstname formatter. Strips any "..., Company" suffix that
  // Azure / Microsoft 365 may append (e.g. "Elliot Marions, PostNord").
  const formatName = (n: string) => {
    const clean = n.split(',')[0].trim()
    const parts = clean.split(/\s+/)
    if (parts.length < 2) return clean
    const lastName = parts[parts.length - 1]
    const firstNames = parts.slice(0, -1).join(' ')
    return `${lastName}, ${firstNames}`
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'PostNord Passbokning'

  const swedishMonths = ['januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december']

  for (const day of info.days) {
    const approved = approvedByDay.get(day.dayIndex) ?? []
    const reserves = reservesByDay.get(day.dayIndex) ?? []
    if (approved.length === 0 && reserves.length === 0) continue

    const d = new Date(day.date + 'T12:00:00')
    const sheetName = `${day.label} ${d.getDate()} ${swedishMonths[d.getMonth()]}`
    const ws = wb.addWorksheet(sheetName)
    ws.getColumn(1).width = 32

    // Approved section
    if (approved.length > 0) {
      const formatted = approved.map(formatName).sort((a, b) => a.localeCompare(b, 'sv'))
      formatted.forEach(name => {
        const row = ws.addRow([name])
        row.getCell(1).font = { name: 'Calibri', size: 14 }
      })
    }

    // Reserve section — appended with a blank row + "Reserver" header.
    // Names use the same Calibri size 14 styling as approved drivers.
    if (reserves.length > 0) {
      if (approved.length > 0) ws.addRow([]) // blank separator
      const header = ws.addRow(['Reserver'])
      header.getCell(1).font = { name: 'Calibri', size: 14, bold: true }
      const formatted = reserves.map(formatName).sort((a, b) => a.localeCompare(b, 'sv'))
      formatted.forEach(name => {
        const row = ws.addRow([name])
        row.getCell(1).font = { name: 'Calibri', size: 14 }
      })
    }
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet('Inga pass')
    ws.addRow(['Inga godkända chaufförer eller reserver denna vecka.'])
  }

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="planering-v${weekNumber}-${weekYear}.xlsx"`,
    },
  })
}
