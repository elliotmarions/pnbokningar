// Seed script: add 11 fake applicants waiting for approval on 2026-05-26
import postgres from 'postgres'

const DATABASE_URL = 'postgresql://postgres.knmlabblsanvfhaulbhw:mT3jXyt36JWV3Wwy@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'

const sql = postgres(DATABASE_URL, { ssl: 'require', prepare: false })

const FAKE_DRIVERS = [
  { id: 'test-driver-01', name: 'Anders Lindqvist', phone: '0701234501' },
  { id: 'test-driver-02', name: 'Maria Johansson',  phone: '0701234502' },
  { id: 'test-driver-03', name: 'Erik Svensson',    phone: '0701234503' },
  { id: 'test-driver-04', name: 'Karin Nilsson',    phone: '0701234504' },
  { id: 'test-driver-05', name: 'Lars Eriksson',    phone: '0701234505' },
  { id: 'test-driver-06', name: 'Anna Karlsson',    phone: '0701234506' },
  { id: 'test-driver-07', name: 'Johan Persson',    phone: '0701234507' },
  { id: 'test-driver-08', name: 'Eva Larsson',      phone: '0701234508' },
  { id: 'test-driver-09', name: 'Mikael Olsson',    phone: '0701234509' },
  { id: 'test-driver-10', name: 'Sara Gustafsson',  phone: '0701234510' },
  { id: 'test-driver-11', name: 'Peter Henriksson', phone: '0701234511' },
]

const TARGET_DATE = '2026-05-26'

try {
  // Get the shift for May 26
  const [shift] = await sql`SELECT id FROM shifts WHERE date = ${TARGET_DATE}`
  if (!shift) {
    console.error(`No shift found for ${TARGET_DATE}`)
    process.exit(1)
  }
  console.log(`Found shift id=${shift.id} for ${TARGET_DATE}`)

  // Insert fake users (skip if already exists)
  for (const d of FAKE_DRIVERS) {
    await sql`
      INSERT INTO users (id, name, phone, role)
      VALUES (${d.id}, ${d.name}, ${d.phone}, 'driver')
      ON CONFLICT (id) DO NOTHING
    `
  }
  console.log('Upserted 11 fake users')

  // Insert applications (skip if already applied)
  let inserted = 0
  for (const d of FAKE_DRIVERS) {
    try {
      await sql`
        INSERT INTO applications (shift_id, user_id, reserve)
        VALUES (${shift.id}, ${d.id}, 0)
        ON CONFLICT DO NOTHING
      `
      inserted++
    } catch (e) {
      console.warn(`Skipped ${d.name}: ${e.message}`)
    }
  }
  console.log(`Inserted ${inserted} applications on ${TARGET_DATE}`)
} finally {
  await sql.end()
}
