# Passbokning — PostNord Trafikledning

Webbaserat schemaläggningssystem för extraanställda chaufförer.  
Chaufförer anmäler intresse via mobil/dator. Trafikledaren godkänner via adminvy. SMS-bekräftelse och påminnelse skickas automatiskt via Twilio.

---

## Kom igång (lokalt)

### 1. Förutsättningar

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Git**

### 2. Klona och installera

```bash
git clone <repo-url>
cd postnord-passbokning
npm install
```

### 3. Miljövariabler

```bash
cp .env.example .env.local
```

Fyll i `.env.local` — se avsnitten nedan om Azure AD och Twilio.

### 4. Starta

```bash
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000).

### 5. Seed-data (testdata utan riktiga konton)

```bash
npm run seed
```

Skapar testanvändare, shifts för innevarande vecka och lite exempeldata.

**OBS:** För att logga in utan riktigt Azure AD-konto under utveckling,  
lägg till `NEXTAUTH_DEBUG=true` och använd `FORCE_USER`-env — se "Dev-inloggning" nedan.

---

## Azure AD-appregistrering (görs av kollega med Azure-behörighet)

### Steg-för-steg

1. Logga in på [portal.azure.com](https://portal.azure.com) och gå till **Azure Active Directory → App registrations → New registration**.

2. Fyll i:
   - **Name:** `Passbokning PostNord`
   - **Supported account types:** *Accounts in this organizational directory only*
   - **Redirect URI:** Välj *Web* och ange `http://localhost:3000/api/auth/callback/azure-ad`  
     (Lägg till produktions-URL senare, t.ex. `https://passbokning.postnord.se/api/auth/callback/azure-ad`)

3. Klicka **Register**.

4. Kopiera värden till `.env.local`:
   - **Application (client) ID** → `AZURE_AD_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_AD_TENANT_ID`

5. Gå till **Certificates & secrets → New client secret**:
   - Välj en giltighetstid (t.ex. 24 månader)
   - Kopiera det genererade värdet → `AZURE_AD_CLIENT_SECRET`  
     ⚠️ Värdet visas bara en gång!

6. Gå till **API permissions**:
   - Kontrollera att `User.Read` (Microsoft Graph, Delegated) finns med
   - Klicka **Grant admin consent**

7. Gå till **Token configuration → Add optional claim**:
   - Token type: **ID**
   - Claim: **oid** (Object ID — stabil identifierare som lagras i databasen)
   - Klicka Add

### Redirect URIs för produktion

Lägg till ytterligare Redirect URIs under **Authentication**:
```
https://din-domän.se/api/auth/callback/azure-ad
```

---

## Twilio — SMS-konfiguration

1. Skapa ett konto på [twilio.com](https://www.twilio.com)
2. Köp ett telefonnummer med SMS-kapacitet (välj ett svenskt +46-nummer om möjligt)
3. Gå till **Console dashboard** och kopiera:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
4. Kopiera telefonnumret (E.164-format, t.ex. `+46701234567`) → `TWILIO_PHONE_NUMBER`

**Trial-konto:** Med ett gratis Twilio-konto kan du bara skicka SMS till verifierade nummer. Verifiera testmottagarnas nummer under *Verified Caller IDs*.

---

## Sätt admin-roll på en användare

### Via databasen (enklast)

```bash
# Öppna SQLite-databasen (kräver sqlite3-klienten)
sqlite3 data/passbokning.db
UPDATE users SET role = 'admin' WHERE email = 'anna.karlen@postnord.se';
.quit
```

### Via miljövariabel (automatisk vid inloggning)

Lägg till Azure AD Object IDs (OIDs) i `.env.local`:
```
ADMIN_USER_IDS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx,yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
```

Hitta OID: Azure portal → Users → sök på personen → Object ID.

### Via adminvyn (kräver att minst en admin redan finns)

Gå till **Admin → Chaufförer** → klicka "Gör till admin" på önskad användare.

---

## Dev-inloggning utan Azure AD

Under utveckling utan riktiga Azure-credentials, kör med:

```bash
# I .env.local:
NEXTAUTH_SECRET=dev-secret-minst-32-tecken-lång-sträng
```

Lägg till en CredentialsProvider manuellt i `src/lib/auth.ts` (finns kommenterat nedan)  
eller kör seed-scriptet och sätt `NEXTAUTH_BYPASS_USER=test-admin-001` för att skippa auth.

Alternativt: använd [`next-auth-mock`](https://github.com/justincy/next-auth-mock) i testmiljö.

---

## SMS-påminnelser (cron-jobb)

### Alternativ 1: Manuellt script (enklast)

```bash
npm run remind
```

Schelägg med **Windows Task Scheduler** att köra var 15:e minut:
- Action: `cmd /c "cd C:\path\to\app && npm run remind"`
- Trigger: Every 15 minutes

### Alternativ 2: HTTP-endpoint

Anropa `GET /api/cron/reminders` med header `x-cron-secret: <CRON_SECRET>` var 15:e minut.  
Kan triggas med t.ex. [cron-job.org](https://cron-job.org) (gratis), Vercel Cron, eller en intern scheduler.

---

## Databasplats

SQLite-filen lagras som standard på `./data/passbokning.db`.  
Ändra med `DATABASE_PATH` i `.env.local`.

**Backup:** Kopiera `passbokning.db`-filen — det är hela databasen.

---

## Projektstruktur

```
postnord-passbokning/
├── src/
│   ├── app/
│   │   ├── api/          API-routes (auth, shifts, applications, approvals, users, export, cron)
│   │   ├── driver/       Chaufförsvy
│   │   └── admin/        Adminvyer (overview, config, drivers, export)
│   ├── components/       React-komponenter
│   └── lib/              db.ts · auth.ts · sms.ts · weeks.ts
├── scripts/
│   ├── seed.ts           Testdata
│   └── remind.ts         SMS-påminnelser (kan schemaläggas)
├── data/                 SQLite-databas (skapas automatiskt)
├── .env.example
└── README.md
```

---

## Produktion

```bash
npm run build
npm start
```

Sätt `NEXTAUTH_URL` till produktions-URLen. Rekommenderas att köra bakom en reverse proxy (nginx/Caddy) med HTTPS.
