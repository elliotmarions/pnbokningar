import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb, ensureMigrated } from '@/lib/db'
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
  await ensureMigrated()

  // When was this week's planning last exported? Drivers approved after this
  // are flagged as "NYA". Null on the first-ever export (nothing is "new").
  const [lastExportRow] = await sql<{ exported_at: Date }[]>`
    SELECT exported_at FROM export_log
    WHERE week_year = ${weekYear} AND week_number = ${weekNumber}
  `
  const lastExport: Date | null = lastExportRow?.exported_at ?? null

  // Approved drivers (with approval time so we can tell which are new)
  const approvedRows = await sql<{ day_index: number; name: string; approved_at: Date }[]>`
    SELECT s.day_index, u.name, ap.approved_at
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

  const approvedByDay = new Map<number, { name: string; isNew: boolean }[]>()
  for (const r of approvedRows) {
    if (!approvedByDay.has(r.day_index)) approvedByDay.set(r.day_index, [])
    const isNew = lastExport != null && new Date(r.approved_at) > lastExport
    approvedByDay.get(r.day_index)!.push({ name: r.name, isNew })
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

  // Thin border around every name cell.
  const cellBorder: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin' },
    left:   { style: 'thin' },
    bottom: { style: 'thin' },
    right:  { style: 'thin' },
  }

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

    // Approved section — already-exported names first (unchanged layout), then
    // any drivers booked since the last export under a "NYA" heading.
    const oldNames = approved.filter(a => !a.isNew).map(a => formatName(a.name)).sort((a, b) => a.localeCompare(b, 'sv'))
    const newNames = approved.filter(a => a.isNew).map(a => formatName(a.name)).sort((a, b) => a.localeCompare(b, 'sv'))

    const addNameRow = (name: string) => {
      const row = ws.addRow([name])
      row.getCell(1).font = { name: 'Calibri', size: 14 }
      row.getCell(1).border = cellBorder
    }

    oldNames.forEach(addNameRow)

    if (newNames.length > 0) {
      if (oldNames.length > 0) ws.addRow([]) // blank separator
      const header = ws.addRow(['NYA'])
      header.getCell(1).font = { name: 'Calibri', size: 14, bold: true }
      newNames.forEach(addNameRow)
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
        row.getCell(1).border = cellBorder
      })
    }

    // Duplicate highlighting: turn any name that appears more than once in the
    // column red (classic Excel "highlight duplicates" look — light-red fill,
    // dark-red text). Baked into the file so a normal Ctrl+V carries the rule
    // into the planning sheet, where duplicates keep getting flagged. The
    // COUNTIF uses a relative full-column ref (A:A) so it adapts to whatever
    // column the names are pasted into. AND(...<>"") skips blanks and the
    // "Reserver" header.
    if (ws.rowCount > 0) {
      ws.addConditionalFormatting({
        ref: `A1:A${ws.rowCount}`,
        rules: [
          {
            type: 'expression',
            priority: 1,
            formulae: ['AND(A1<>"",A1<>"Reserver",A1<>"NYA",COUNTIF(A:A,A1)>1)'],
            style: {
              font: { name: 'Calibri', size: 14, color: { argb: 'FF9C0006' } },
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
            },
          },
        ],
      })
    }
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet('Inga pass')
    ws.addRow(['Inga godkända chaufförer eller reserver denna vecka.'])
  }

  // Record this export as the new baseline so the next export flags only the
  // drivers booked after now.
  await sql`
    INSERT INTO export_log (week_year, week_number, exported_at)
    VALUES (${weekYear}, ${weekNumber}, NOW())
    ON CONFLICT (week_year, week_number) DO UPDATE SET exported_at = NOW()
  `

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="planering-v${weekNumber}-${weekYear}.xlsx"`,
    },
  })
}
