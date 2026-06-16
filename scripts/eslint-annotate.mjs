// Temporary CI helper: read an eslint JSON report and emit GitHub Actions
// annotations (::error / ::warning), so the findings are readable via the
// public check-runs annotations API even when raw log download is blocked.
// Remove once lint is clean and blocking.
import fs from 'node:fs'

let report = []
try {
  report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'))
} catch {
  console.log('::notice::no eslint report found')
  process.exit(0)
}

const cwd = process.cwd().split('\\').join('/') + '/'
let total = 0
for (const f of report) total += f.messages.length

let shown = 0
const MAX = 45
for (const f of report) {
  const file = f.filePath.split('\\').join('/').replace(cwd, '')
  for (const m of f.messages) {
    if (shown >= MAX) break
    shown++
    const level = m.severity === 2 ? 'error' : 'warning'
    const msg = String(m.message || '').replace(/\r?\n/g, ' ')
    console.log(`::${level} file=${file},line=${m.line || 1},col=${m.column || 1}::[${m.ruleId || '-'}] ${msg}`)
  }
}
console.log(`::notice::ESLint findings total=${total} (annotated up to ${MAX})`)
