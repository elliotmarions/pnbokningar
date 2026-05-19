import { readFileSync } from 'fs'
import postgres from 'postgres'

// Load .env.local
readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) {
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) process.env[key] = val
  }
})

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })

const today = new Date()
const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

const result = await sql`UPDATE shifts SET is_open = 0 WHERE date < ${todayStr} AND is_open = 1`
console.log(`Stängda: ${result.count} pass (datum < ${todayStr})`)
await sql.end()
