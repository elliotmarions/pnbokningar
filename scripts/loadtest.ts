/**
 * Load test — simulates the week-open burst against a THROWAWAY Supabase DB.
 *
 * It reuses the app's real db layer (same queries, pool size, prepare:false)
 * so the numbers reflect production behaviour. All data is isolated to a
 * far-future test week (year 2099) and `loadtest-*` users, and is deleted
 * before and after the run.
 *
 *   1. Seed ~60 drivers + one open test week
 *   2. Phase A — 60 concurrent week reads (page loads)
 *   3. Phase B — 60 concurrent applies ("Anmäl intresse")
 *   4. Phase C — admin approves 50 concurrently
 *   5. Report latency percentiles + errors, then clean up
 *
 * Usage:
 *   npm run loadtest          # full run
 *   npm run loadtest clean    # only delete leftover test data
 *
 * Requires DATABASE_URL in .env.local pointing at the TEST database.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// --- Load DATABASE_URL from .env.local BEFORE importing the db layer
// (db.ts reads process.env.DATABASE_URL at import time). ---
function loadEnv() {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/)
      if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env.local — fall through to the check below */
  }
}
loadEnv()

if (!process.env.DATABASE_URL) {
  console.error('✗ No DATABASE_URL found in .env.local')
  process.exit(1)
}

const TEST_YEAR = 2099
const TEST_WEEK = 1
const N_DRIVERS = 60
const N_APPROVE = 50

// Mon–Sat dates for the fake week (arbitrary far-future dates).
const WEEK_DATES = ['2099-01-05', '2099-01-06', '2099-01-07', '2099-01-08', '2099-01-09', '2099-01-10']

function pct(samples: number[], p: number): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function report(label: string, results: { ok: boolean; ms: number; err?: string }[]) {
  const oks = results.filter(r => r.ok)
  const fails = results.filter(r => !r.ok)
  const ms = oks.map(r => r.ms)
  console.log(`\n── ${label} ──`)
  console.log(`   requests : ${results.length}`)
  console.log(`   ok       : ${oks.length}`)
  console.log(`   failed   : ${fails.length}`)
  if (ms.length) {
    console.log(`   p50      : ${pct(ms, 50).toFixed(0)} ms`)
    console.log(`   p95      : ${pct(ms, 95).toFixed(0)} ms`)
    console.log(`   max      : ${Math.max(...ms).toFixed(0)} ms`)
  }
  if (fails.length) {
    const sample = fails.slice(0, 3).map(f => f.err).join(' | ')
    console.log(`   errors   : ${sample}`)
  }
}

async function main() {
  const url = new URL(process.env.DATABASE_URL!)
  console.log(`Target DB host : ${url.host}`)
  if (url.host.includes('pooler.supabase.com')) {
    console.log('               (transaction pooler — good)')
  }

  const db = await import('../src/lib/db')
  const { getDb, ensureMigrated, applicationRepo, approvalRepo, shiftRepo } = db
  const sql = getDb()

  const cleanOnly = process.argv.includes('clean')

  console.log('\nEnsuring schema…')
  await ensureMigrated()

  console.log('Cleaning any leftover test data…')
  await cleanup(sql)
  if (cleanOnly) { console.log('✓ Clean done.'); await sql.end(); return }

  // --- Seed ---
  console.log(`Seeding ${N_DRIVERS} drivers + admin…`)
  await sql`INSERT INTO users (id, name, role) VALUES ('loadtest-admin', 'Loadtest Admin', 'admin') ON CONFLICT (id) DO NOTHING`
  for (let i = 0; i < N_DRIVERS; i++) {
    await sql`INSERT INTO users (id, name, role) VALUES (${`loadtest-${i}`}, ${`Loadtest Driver ${i}`}, 'driver') ON CONFLICT (id) DO NOTHING`
  }

  console.log('Seeding test week…')
  for (let d = 0; d < WEEK_DATES.length; d++) {
    await sql`
      INSERT INTO shifts (week_year, week_number, day_index, date, is_open, slots, ever_opened)
      VALUES (${TEST_YEAR}, ${TEST_WEEK}, ${d}, ${WEEK_DATES[d]}, 1, ${N_DRIVERS}, 1)
      ON CONFLICT (week_year, week_number, day_index) DO NOTHING
    `
  }
  const shifts = await shiftRepo.getWeek(TEST_YEAR, TEST_WEEK)
  console.log(`✓ ${shifts.length} shifts ready, ${N_DRIVERS} drivers ready.`)

  // --- Phase A: concurrent week reads (page loads) ---
  console.log('\nPhase A — 60 concurrent week reads…')
  const readResults = await Promise.all(
    Array.from({ length: N_DRIVERS }, async () => {
      const t0 = performance.now()
      try {
        await shiftRepo.getWeekWithCounts(TEST_YEAR, TEST_WEEK)
        await applicationRepo.forShifts(shifts.map(s => s.id))
        return { ok: true, ms: performance.now() - t0 }
      } catch (e) {
        return { ok: false, ms: performance.now() - t0, err: String(e) }
      }
    })
  )
  report('Phase A · week reads (page loads)', readResults)

  // --- Phase B: concurrent applies (each driver applies to a random day) ---
  console.log('\nPhase B — 60 concurrent applies…')
  const applyResults = await Promise.all(
    Array.from({ length: N_DRIVERS }, async (_, i) => {
      const shift = shifts[i % shifts.length] // spread across the 6 days
      const driverId = `loadtest-${i}`
      const t0 = performance.now()
      try {
        // Mirror the real POST /api/applications path: streak check then apply.
        await applicationRepo.consecutiveCount(driverId, shift.date)
        const app = await applicationRepo.apply(shift.id, driverId, false)
        return { ok: true, ms: performance.now() - t0, appId: app.id }
      } catch (e) {
        return { ok: false, ms: performance.now() - t0, err: String(e) }
      }
    })
  )
  report('Phase B · applies (anmäl intresse)', applyResults)

  // --- Phase C: admin approves 50 concurrently ---
  const appIds = applyResults
    .filter((r): r is { ok: true; ms: number; appId: number } => r.ok && 'appId' in r)
    .map(r => r.appId)
    .slice(0, N_APPROVE)
  console.log(`\nPhase C — admin approves ${appIds.length} concurrently…`)
  const approveResults = await Promise.all(
    appIds.map(async (appId) => {
      const t0 = performance.now()
      try {
        await approvalRepo.approve(appId, 'loadtest-admin')
        return { ok: true, ms: performance.now() - t0 }
      } catch (e) {
        return { ok: false, ms: performance.now() - t0, err: String(e) }
      }
    })
  )
  report('Phase C · approvals (admin)', approveResults)

  // --- Cleanup ---
  console.log('\nCleaning up test data…')
  await cleanup(sql)
  console.log('✓ Done. Test data removed.')
  await sql.end()
}

async function cleanup(sql: import('postgres').Sql) {
  // Deleting the test shifts cascades their applications + approvals;
  // deleting loadtest users cascades anything else they own.
  await sql`DELETE FROM shifts WHERE week_year = ${TEST_YEAR}`
  await sql`DELETE FROM users WHERE id LIKE 'loadtest-%'`
}

main().catch(err => { console.error(err); process.exit(1) })
