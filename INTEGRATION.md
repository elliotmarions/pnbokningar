# Partnerintegration — API

Dokumentation för externa system som ska synka bokningar mot passbokningen.
Det här dokumentet kan skickas vidare till partnern. **API-nyckeln skickas
separat, aldrig i det här dokumentet.**

- **Bas-URL:** `https://<din-app>.vercel.app`
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

## 3. Webhooks (oss → partner)

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

### Leveransgarantier

Leveransen är *best effort*: vi gör ett försök och loggar fel, men gör inga
omförsök. Kör därför avstämningen i avsnitt 1 regelbundet (t.ex. varje natt för
kommande 30 dagar) så att en tappad webhook självläker.

## 4. Engångssynk vid uppstart

När partnersidan är redo kan en admin öppna `/api/integration/sync-all` i
webbläsaren (inloggad som admin). Då skickas en `booking.confirmed` för varje
bekräftad bokning från och med idag, så partnern får hela beståndet. Kör
gärna om den vid behov — partnern ska upserta på `bookingId`.

## 5. Snabbtest

```bash
curl -sS -H "Authorization: Bearer $NYCKEL" \
  "https://<din-app>.vercel.app/api/integration/bookings?from=2026-09-01&to=2026-09-30"
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
