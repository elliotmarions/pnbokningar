'use client'
import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet } from './Icons'
import { Toast, useToast } from './Toast'

interface DriverRow { name: string; shifts: number; hours: number; last_shift: string }
interface WeekRow { week_year: number; week_number: number; shifts: number; hours: number; drivers: number; last_date: string }

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function nWeeksAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n * 7)
  return d.toISOString().slice(0, 10)
}

export function ExportView() {
  const [from, setFrom] = useState(nWeeksAgoStr(12))
  const [to, setTo] = useState(todayStr())
  const [group, setGroup] = useState<'driver' | 'week'>('driver')
  const [preview, setPreview] = useState<DriverRow[] | WeekRow[]>([])
  const [weekYear, setWeekYear] = useState(0)
  const [weekNumber, setWeekNumber] = useState(0)
  const { toast, show: showToast, clear: clearToast } = useToast()

  useEffect(() => {
    fetch('/api/weeks').then(r => r.json()).then(d => {
      setWeekYear(d.weekYear)
      setWeekNumber(d.weekNumber)
    })
    loadPreview()
  }, [])

  useEffect(() => { loadPreview() }, [from, to, group])

  async function loadPreview() {
    const res = await fetch(`/api/export/preview?from=${from}&to=${to}&group=${group}`)
    if (res.ok) setPreview(await res.json())
  }

  const download = () => {
    window.location.href = `/api/export?from=${from}&to=${to}&group=${group}`
    showToast('Nedladdning startar…')
  }

  const downloadPlanning = () => {
    window.location.href = `/api/export/planning?year=${weekYear}&week=${weekNumber}`
    showToast('Planeringsexport startar…')
  }

  return (
    <>
      <div className="export-top">
        <div className="eyebrow">EXPORT</div>
        <h2>Sammanställning</h2>
        <div className="helper">Ladda ner data som Excel-fil eller exportera planering för aktuell vecka.</div>
      </div>

      <div className="export-card">
        <div className="export-row">
          <div className="field">
            <label>Från</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>Till</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="field">
            <label>Grupp</label>
            <select value={group} onChange={e => setGroup(e.target.value as 'driver' | 'week')}>
              <option value="driver">Per chaufför</option>
              <option value="week">Per vecka</option>
            </select>
          </div>
          <div className="export-actions">
            <button className="btn btn-sm" onClick={downloadPlanning}>
              <FileSpreadsheet className="svg-ico svg-ico-sm" />
              Exportera till planering
            </button>
            <button className="btn btn-sm btn-primary" onClick={download}>
              <Download className="svg-ico svg-ico-sm" />
              Ladda ner .xlsx
            </button>
          </div>
        </div>
      </div>

      <div className="tbl-wrap">
        <div className="tbl-head">
          <div>
            <div className="ttl">Förhandsvisning</div>
            <div className="sub">{preview.length} {group === 'driver' ? 'chaufförer' : 'veckor'} · {from} → {to}</div>
          </div>
        </div>
        <table className="tbl">
          {group === 'driver' ? (
            <>
              <thead><tr>
                <th>Namn</th>
                <th className="num">Antal pass</th>
                <th>Senaste pass</th>
              </tr></thead>
              <tbody>
                {(preview as DriverRow[]).map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="num">{r.shifts}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.last_shift}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr>
                <th>Vecka</th>
                <th className="num">Antal pass</th>
                <th className="num">Unika chaufförer</th>
                <th>Senaste datum</th>
              </tr></thead>
              <tbody>
                {(preview as WeekRow[]).map((r, i) => (
                  <tr key={i}>
                    <td>V.{r.week_number} {r.week_year}</td>
                    <td className="num">{r.shifts}</td>
                    <td className="num">{r.drivers}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.last_date}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
      <Toast message={toast.msg} type={toast.type} onDismiss={clearToast} />
    </>
  )
}
