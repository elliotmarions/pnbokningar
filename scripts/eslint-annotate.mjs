// Temporary CI diagnostic: read an eslint JSON report and emit a GitHub Actions
// annotation that groups findings by rule + severity, so the full error set is
// readable via the public check-runs annotations API (raw log download is
// blocked on some corporate networks). Remove once lint is clean and blocking.
import fs from 'node:fs'

let report = []
try {
  report = JSON.parse(fs.readFileSync('eslint-report.json', 'utf8'))
} catch {
  console.log('::error::eslint produced no JSON report — likely a config/parse error, not findings')
  process.exit(0)
}

const errs = {}
const warns = {}
for (const f of report) {
  for (const m of f.messages) {
    const id = m.ruleId || '(no-rule/parse-error)'
    const bucket = m.severity === 2 ? errs : warns
    bucket[id] = (bucket[id] || 0) + 1
  }
}
const fmt = (o) =>
  Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'

console.log(`::error::ESLINT ERRORS by rule: ${fmt(errs)}`)
console.log(`::notice::ESLINT warnings by rule: ${fmt(warns)}`)

// Surface any parse errors (no ruleId, severity 2) with location.
for (const f of report) {
  for (const m of f.messages) {
    if (m.severity === 2 && !m.ruleId) {
      const file = f.filePath.split('\\').join('/').split('/').slice(-2).join('/')
      console.log(`::error file=${file},line=${m.line || 1}::PARSE: ${String(m.message).replace(/\r?\n/g, ' ').slice(0, 150)}`)
    }
  }
}
