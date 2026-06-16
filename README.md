# Passbokning — PostNord

Webbaserat schemaläggningssystem för extraanställda chaufförer. Chaufförer anmäler
intresse via mobil/dator, trafikledaren godkänner i adminvyn, och bekräftelser
skickas som **web push-notiser** (PWA). Nästa veckas pass öppnas automatiskt varje
onsdag kväll.

## Teknik

| Lager | Val |
| --- | --- |
| Frontend/Backend | Next.js 16 (App Router), React 18 |
| Auth | Supabase Auth med **Azure AD / Microsoft Entra** som OAuth-provider |
| Databas | Supabase Postgres, åtkomst via [`postgres`](https://github.com/porsager/postgres) (transaction pooler, port 6543) |
| Notiser | Web Push (VAPID) — inga SMS |
| Export | Excel via `exceljs` |
| Hosting | Vercel (region `dub1`, samma som databasen), Vercel Cron |

> **Obs:** Tidigare versioner använde SQLite, NextAuth och Twilio-SMS. Allt det är
> utbytt — se tabellen ovan för vad som faktiskt körs idag.

## Kom igång (lokalt)

### 1. Förutsättningar
- **Node.js 24+** ([nodejs.org](https://nodejs.org))
- Ett Supabase-projekt (för auth + databas)

### 2. Installera
```bash
git clone https://github.com/elliotmarions/pnbokningar.git
cd pnbokningar
npm install
```

### 3. Miljövariabler
```bash
cp .env.example .env.local
```
Fyll i värdena — se [Miljövariabler](#miljövariabler) nedan.

### 4. Starta
```bash
npm run dev
```
Öppna [http://localhost:3000](http://localhost:3000). Databasschemat skapas/migreras
automatiskt vid första anropet (se [Databas & migrationer](#databas--migrationer)).

## Miljövariabler

| Variabel | Krävs | Beskrivning |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase projekt-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon-nyckel (säker i klienten, skyddad av RLS) |
| `DATABASE_URL` | ✅ | Postgres transaction pooler-URL (port 6543) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | ✅ (notiser) | Web Push-nycklar, genereras med `npm run gen-vapid` |
| `CRON_SECRET` | ✅ (prod) | Delad hemlighet för Vercel Cron-anrop |
| `ADMIN_USER_IDS` | ⬜ | Komma-separerade Azure-Object-IDs som blir admin automatiskt |
| `INTEGRATION_API_KEY` | ⬜ | Inkommande API-nyckel för partnerintegration |
| `INTEGRATION_WEBHOOK_URL` / `INTEGRATION_WEBHOOK_SECRET` | ⬜ | Utgående bokningswebhooks till externt system |

## Inloggning (Supabase + Azure AD)

Inloggningen sker via Supabase Auth med `azure`-providern. Azure-appregistreringen
konfigureras i **Supabase-dashboarden → Authentication → Providers → Azure**, inte via
app-miljövariabler.

1. Registrera en app i Azure (Microsoft Entra) → App registrations → New registration.
2. Lägg in **Client ID**, **Client Secret** och **Tenant** i Supabase Azure-providern.
3. Registrera Supabase callback-URL:en i Azure under Redirect URIs:
   `https://<ditt-projekt>.supabase.co/auth/v1/callback`.
4. Appens egen `/auth/callback`-route växlar in koden mot en session (PKCE).

## Admin-roll

- **Automatiskt:** lägg användarens Azure Object ID i `ADMIN_USER_IDS`.
- **Via UI:** en befintlig admin går till **Admin → Chaufförer** och trycker
  "Gör till admin".

## Databas & migrationer

Schemat lever i `src/lib/db.ts`. `ensureMigrated()` körs (en gång per process) vid
första requesten och är idempotent: `CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE ... IF NOT EXISTS` för struktur, plus versionerade engångs-backfills som
gateas via tabellen `schema_migrations`. RLS är påslaget på alla tabeller med en
`service_role`-policy (se [SECURITY.md](SECURITY.md) när den finns).

## Web Push / VAPID

```bash
npm run gen-vapid   # skriver ut ett VAPID-nyckelpar
```
Lägg nycklarna i `.env.local` (och i Vercel för prod). Utan dem är notiser avstängda
(appen fungerar ändå).

## Veckoöppning (Vercel Cron)

Nästa veckas pass öppnas automatiskt onsdag kväll av `/api/cron/open-week`. Två
cron-jobb i [`vercel.json`](vercel.json) (16:00 och 17:00 UTC) täcker både sommar- och
vintertid; tidsgrinden (`shouldAutoOpen` i `src/lib/weeks.ts`) accepterar onsdag
18:00–22:59 svensk tid eftersom Vercel-cron är "best-effort". Driftnoter finns i
[`DRIFT.md`](DRIFT.md).

## Kvalitetsgrindar

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest (enhetstester för lib/)
npm run build       # produktionsbygge
```
Samma steg körs i CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) på varje
push och pull request.

## Produktion (Vercel)

Deployas från `main` till Vercel. Sätt alla miljövariabler ovan i Vercel-projektet.
Cron-jobben är begränsade av Vercels Hobby-plan (max 2) — se `vercel.json`.

## Projektstruktur

```
pnbokningar/
├── src/
│   ├── app/
│   │   ├── api/        API-routes (shifts, applications, approvals, users, export, cron, integration, push)
│   │   ├── auth/       OAuth-callback
│   │   ├── driver/     Chaufförsvy
│   │   └── admin/      Adminvyer (overview, config, drivers, export, log, …)
│   ├── components/     React-komponenter
│   └── lib/            db.ts · auth.ts · weeks.ts · holidays.ts · push.ts · validate.ts · …
├── scripts/            seed, gen-vapid, loadtest
├── .github/workflows/  CI
├── vercel.json         Cron + region
└── DRIFT.md            Driftnoter
```
