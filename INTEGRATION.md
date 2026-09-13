# Partnerintegration — API

Dokumentation för externa system som ska synka bokningar mot passbokningen.
Det här dokumentet kan skickas vidare till partnern. **API-nyckeln skickas
separat, aldrig i det här dokumentet.**

- **Bas-URL:** `https://pnbokningar.vercel.app` (byt till er egna domän om en sådan sätts upp)
- **Format:** JSON över HTTPS, server-till-server (nyckeln hör hemma i en
  backend — aldrig i en webbläsare eller mobilapp).
- **Tidszon:** datum är `YYYY-MM-DD` i svensk lokaltid, tider är `HH:MM`.
- **Identifierare:** `bookingId` är stabil över bokningens hela livslängd —
  använd den som nyckel på partnersidan (upsert).

## Autentisering

Alla inkommande anrop kräver en API-nyckel som bearer-token:

```
Authorization: Bearer pnb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Fel eller saknad nyckel ger `401 {"error":"Unauthorized"}`. Varje partner får
en egen nyckel, så en nyckel kan spärras utan att påverka andra.

## 1. Hämta bekräftade bokningar (partner → oss)

```
GET /api/integration/bookings?from=2026-09-01&to=2026-09-30
Authorization: Bearer <nyckel>
```

`from` och `to` är inklusive och måste vara `YYYY-MM-DD` (annars `400`).

Svar `200` — exakt de bokningar som ska finnas hos partnern i perioden:

```json
[
  {
    "bookingId": 1423,
    "driverName": "Anna Andersson",
    "date": "2026-09-14",
    "startTime": "06:00",
    "endTime": "14:00"
  }
]
```

Använd den här som **avstämning** (t.ex. nattligt jobb): allt som finns hos er
men inte i svaret ska tas bort, allt som finns i svaret ska finnas hos er.
Webhookarna nedan är realtidskanalen — den här är skyddsnätet om en webhook
tappas.

## 2. Avboka ett pass (partner → oss)

```
POST /api/integration/bookings/1423/cancel
Authorization: Bearer <nyckel>
Content-Type: application/json

{ "reason": "Turen inställd" }
```

`reason` är valfri och hamnar i aktivitetsloggen. Anropet gör samma sak som när
en trafikledare avbokar: godkännandet tas bort och **chauffören får en
push-notis**. Använd det bara för riktiga avbokningar.

| Svar | Betydelse |
| --- | --- |
| `200 {"ok":true,"bookingId":1423}` | Avbokad |
| `400 {"error":"Invalid booking id"}` | Ogiltigt id i URL:en |
| `401` | Fel/saknad nyckel |
| `404 {"error":"Booking not found"}` | Okänt `bookingId` |

Anropet skickar medvetet **ingen** `booking.cancelled`-webhook tillbaka —
partnern initierade avbokningen, så ekot skulle riskera en loop. Upprepade
anrop på samma bokning är ofarliga.

## 3. Lista reserver (partner → oss)

```
GET /api/integration/reserves?from=2026-09-01&to=2026-09-30
Authorization: Bearer <nyckel>
```

Svar `200` — bara reserver som fortfarande går att boka (inte återkallade,
inte avvisade, inte redan godkända):

```json
[
  {
    "reserveId": 512,
    "driverName": "Anna Andersson",
    "date": "2026-09-15",
    "startTime": "16:00",
    "endTime": "22:00",
    "appliedAt": "2026-09-10 12:34:56"
  }
]
```

**En reserv hör alltid till ett datum.** Det finns ingen allmän "kan hoppa
in"-lista — varje reservanmälan gäller ett specifikt pass. Det finns ett pass
per dag, så det finns ingen dag/kväll-uppdelning; tiderna följer veckodagen:

| Dag | Tider |
| --- | --- |
| Måndag–fredag | 16:00–22:00 |
| Lördag | 09:45–18:00 |

`appliedAt` är när chauffören anmälde sig, i svensk tid. Listan är sorterad på
datum och sedan anmälningstid, vilket är den rättvisa köordningen — visa gärna
den i planeringsvyn.

Telefonnummer ingår inte (dataminimering, se SECURITY.md).

## 4. Boka en reserv (partner → oss)

```
POST /api/integration/reserves/512/book
Authorization: Bearer <nyckel>
Content-Type: application/json

{ "bookedBy": "Namn på planeraren", "bookedByEmail": "planerare@example.com" }
```

Gör exakt samma sak som när en trafikledare flyttar upp en reserv i appen:
chauffören får sin vanliga push (`Pass godkänt ✅`), och vi skickar
`booking.confirmed` tillbaka till er som vanligt.

> **Viktigt:** uppflyttningen behåller samma rad, så `bookingId` i svaret är
> **samma nummer** som `reserveId`. Det skapas inget andra id.

| Svar | Betydelse |
| --- | --- |
| `200 {"bookingId":512}` | Bokad — samma id som reserven |
| `400` | Ogiltigt id i URL:en |
| `401` | Fel/saknad nyckel |
| `404 {"error":"Reserve not found"}` | Okänt id |
| `409 {"reason":"already_booked"}` | Redan bokad |
| `409 {"reason":"withdrawn"\|"rejected"}` | Reserven är inte längre aktiv |

`bookedBy` och `bookedByEmail` är valfria och hamnar i aktivitetsloggen, så det
syns hos oss vem som bokade. Godkännandet har ingen admin bakom sig —
planeraren är ingen användare i vårt system.

### Om reserven avbokas senare

Avbokar ni en bokning som kom från reservlistan (avsnitt 2) går chauffören
**tillbaka till reservlistan** i stället för att försvinna: anmälan sa att hen
var tillgänglig den dagen, och en avbruten bokning tar inte tillbaka det. Hen
dyker alltså upp i `GET /api/integration/reserves` igen, och får en push som
säger att passet avbokats men att hen står kvar som reserv.

Avbokning av en bokning som *inte* kom från reservlistan fungerar som förut —
den försvinner.

## 5. Webhooks (oss → partner)

Om `INTEGRATION_WEBHOOK_URL` är satt postar vi en händelse direkt när en
bokning bekräftas eller avbokas hos oss:

```http
POST <partnerns webhook-URL>
Content-Type: application/json
X-Signature: sha256=<hex>

{
  "event": "booking.confirmed",
  "bookingId": 1423,
  "driverName": "Anna Andersson",
  "date": "2026-09-14",
  "startTime": "06:00",
  "endTime": "14:00",
  "sentAt": "2026-09-10T12:34:56.789Z"
}
```

`event` är `booking.confirmed` eller `booking.cancelled`. Svara `2xx` snabbt;
tunga jobb köas på partnersidan.

### Reservhändelser

Samma URL och samma signatur som bokningshändelserna. Reservlistan speglas hos
er, så varje förändring pushas i stället för att inväntas av nästa pollning.

```json
{
  "event": "reserve.added",
  "reserveId": 512,
  "driverName": "Anna Andersson",
  "date": "2026-09-15",
  "startTime": "16:00",
  "endTime": "22:00",
  "appliedAt": "2026-09-12T13:31:00.000Z",
  "sentAt": "2026-09-13T16:20:00.000Z"
}
```

```json
{ "event": "reserve.removed", "reserveId": 512, "sentAt": "..." }
```

`reserve.added` skickas när en ansökan blir en aktiv reserv — chauffören anmäler
sig själv, en admin lägger till eller flyttar någon till listan, ett avvisande
eller en avanmälan ångras, eller en bokning som kom från reservlistan avbokas.

`reserve.removed` skickas när den slutar vara det, **oavsett orsak**: bokad
(av er eller av oss), avvisad, avanmäld, eller raderad. Händelsen bär bara
`reserveId` — orsaken är inte er att agera på.

En reserv som bokas ger alltså både `reserve.removed` och `booking.confirmed`,
och avbokas den bokningen sedan kommer `booking.cancelled` följt av ett nytt
`reserve.added` med samma id.

> **Notera formatet på `appliedAt`.** I webhooken är det ISO-8601 i UTC enligt
> ert kontrakt (`2026-09-12T13:31:00.000Z`). I `GET /api/integration/reserves`
> är samma fält svensk lokaltid utan tidszon (`2026-09-12 13:31:00`), eftersom
> ni redan konsumerar den endpointen och vi inte ville bryta den i tysthet.
> Säg till om ni vill ha ISO-UTC på båda ställena, så byter vi.

### Verifiera signaturen

`X-Signature` är `sha256=` + HMAC-SHA256 över den **råa** request-bodyn med det
delade webhook-secretet. Verifiera alltid innan ni litar på innehållet:

```js
import crypto from 'crypto'

function verify(rawBody, header, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(header ?? '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
```

Räkna HMAC på bodyn **innan** JSON-parsning — omserialiserad JSON ger fel
signatur.

### Felsökning när inget kommer fram

Kör `npm run test-webhook` — den skickar en enda signerad `booking.confirmed`
(bookingId `999999`) och skriver ut partnerns svarskod och svarsbody. Samma
body-konstruktion och signering som produktionskoden, så svaret betyder samma
sak.

Får du `401` matchar inte hemligheterna. Jämför fingeravtryck i stället för att
skicka hemligheten fram och tillbaka — `/api/integration/diagnostics` (admin)
visar vårt, och partnern räknar fram sitt med:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(process.env.INTEGRATION_HMAC_SECRET).digest('hex').slice(0,12))"
```

Lika fingeravtryck = samma hemlighet. Olika = någon av er har en gammal.

### Leveransgarantier

Leveransen är *best effort*: vi gör ett försök och loggar fel, men gör inga
omförsök. Det gäller reservhändelserna lika mycket som bokningshändelserna —
behåll pollningen av `GET /api/integration/reserves` som skyddsnät. Kör därför avstämningen i avsnitt 1 regelbundet (t.ex. varje natt för
kommande 30 dagar) så att en tappad webhook självläker.

## 6. Engångssynk vid uppstart

När partnersidan är redo kan en admin öppna `/api/integration/sync-all` i
webbläsaren (inloggad som admin). Då skickas en `booking.confirmed` för varje
bekräftad bokning från och med idag, så partnern får hela beståndet. Kör
gärna om den vid behov — partnern ska upserta på `bookingId`.

## 7. Snabbtest

```bash
curl -sS -H "Authorization: Bearer $NYCKEL" \
  "https://pnbokningar.vercel.app/api/integration/bookings?from=2026-09-01&to=2026-09-30"
```

Förväntat: `200` med en JSON-array. Får ni `401` är nyckeln fel eller inte
utrullad (kom ihåg redeploy efter ändrad env-variabel i Vercel).

---

## För oss som driftar (inte partnern)

### Skapa en nyckel

```bash
npm run gen-integration-key -- akeri
```

Skriptet skriver ut en ny nyckel (256 bitar entropi) — den sparas ingenstans,
så tappar du bort den får du generera en ny.

1. Lägg raden `akeri:pnb_...` i `INTEGRATION_API_KEY` i Vercel → Settings →
   Environment Variables. Flera partners separeras med komma:
   `akeri:pnb_aaa,lager:pnb_bbb`
2. **Redeploya** — env-ändringar slår igenom först vid ny deploy.
3. Skicka nyckeln till partnern via lösenordshanterare eller annan säker kanal.
   Aldrig i mejl, chatt, issue eller commit.

Etiketten (`akeri:`) syns i aktivitetsloggen när partnern avbokar, så man ser
vilket system som gjorde vad.

### Rotera eller spärra

- **Rotera:** generera en ny nyckel med ny etikett (`akeri-2`), lägg den
  *bredvid* den gamla, låt partnern byta, ta sedan bort den gamla raden.
  Inget avbrott.
- **Spärra:** ta bort partnerns rad ur `INTEGRATION_API_KEY` och redeploya.
- **Läckt nyckel:** spärra direkt enligt ovan — det finns ingen annan spärr.

### Utgående webhooks

Sätt `INTEGRATION_WEBHOOK_URL` till partnerns endpoint och
`INTEGRATION_WEBHOOK_SECRET` till secretet från samma skript. Utan URL är
utgående webhooks avstängda (appen fungerar ändå). Just nu stöds **en**
webhook-mottagare — fler partners som vill ha push kräver en utbyggnad.
