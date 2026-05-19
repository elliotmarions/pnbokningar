import { readFileSync } from 'fs'
import postgres from 'postgres'
import bcrypt from 'bcryptjs'

readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const idx = line.indexOf('=')
  if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
})

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })

const drivers = [
  { id: 'test-driver-1', name: 'Anna Lindqvist',   email: 'anna@test.se',   phone: '0701234561' },
  { id: 'test-driver-2', name: 'Erik Johansson',   email: 'erik@test.se',   phone: '0701234562' },
  { id: 'test-driver-3', name: 'Maria Svensson',   email: 'maria@test.se',  phone: '0701234563' },
  { id: 'test-driver-4', name: 'Lars Petersson',   email: 'lars@test.se',   phone: '0701234564' },
  { id: 'test-driver-5', name: 'Sofia Nilsson',    email: 'sofia@test.se',  phone: '0701234565' },
]

const hash = await bcrypt.hash('test123', 10)

for (const d of drivers) {
  await sql`
    INSERT INTO users (id, name, email, phone, role, password_hash)
    VALUES (${d.id}, ${d.name}, ${d.email}, ${d.phone}, 'driver', ${hash})
    ON CONFLICT (id) DO UPDATE SET name = ${d.name}, phone = ${d.phone}
  `
  console.log(`✓ ${d.name}`)
}

console.log('\nInloggning: e-post + lösenord "test123"')
await sql.end()
