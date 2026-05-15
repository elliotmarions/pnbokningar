import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { weekInfoFromNumbers } from '@/lib/weeks'
import ExcelJS from 'exceljs'

// GET /api/export/planning?year=2026&week=22
// Generates a planning xlsx: one sheet per day, names as "Efternamn, Förnamn", alphabetical
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const weekYear = parseInt(searchParams.get('year') ?? '0')
  const weekNumber = parseInt(searchParams.get('week') ?? '0')

  if (!weekYear || !weekNumber) return NextResponse.json({ error: 'year and week required' }, { status: 400 })

  const info = weekInfoFromNumbers(weekYear, weekNumber)
  const db = getDb()

  // Get all approvals for this week, grouped by day
  const rows = db.prepare(`
    SELECT s.day_index, u.name
    FROM approvals ap
    JOIN applications a ON a.id = ap.application_id
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    WHERE s.week_year = ? AND s.week_number = ?
    ORDER BY s.day_index, u.name
  `).all(weekYear, weekNumber) as { day_index: number; name: string }[]

  // Group by day
  const byDay = new Map<number, string[]>()
  for (const r of rows) {
    if (!byDay.has(r.day_index)) byDay.set(r.day_index, [])
    byDay.get(r.day_index)!.push(r.name)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'PostNord Passbokning'

  const swedishMonths = ['januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december']

  for (const day of info.days) {
    const names = byDay.get(day.dayIndex)
    if (!names || names.length === 0) continue

    // Format date: "19 maj"
    const d = new Date(day.date + 'T12:00:00')
    const sheetName = `${day.label} ${d.getDate()} ${swedishMonths[d.getMonth()]}`

    // Convert "Förnamn Efternamn" → "Efternamn, Förnamn" and sort
    const formatted = names.map(n => {
      const parts = n.trim().split(/\s+/)
      if (parts.length < 2) return n
      const lastName = parts[parts.length - 1]
      const firstNames = parts.slice(0, -1).join(' ')
      return `${lastName}, ${firstNames}`
    }).sort((a, b) => a.localeCompare(b, 'sv'))

    const ws = wb.addWorksheet(sheetName)
    ws.getColumn(1).width = 32
    formatted.forEach(name => ws.addRow([name]))
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet('Inga pass')
    ws.addRow(['Inga godkända chaufförer denna vecka.'])
  }

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="planering-v${weekNumber}-${weekYear}.xlsx"`,
    },
  })
}
