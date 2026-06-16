# Säkerhet — pnbokningar

Säkerhetsöversikt och behörighetsmatris för passbokningssystemet. Skriven som del
av Fas 2 (säkerhetshärdning) i [sälj-grund-planen](DRIFT.md).

## Säkerhetsmodell i korthet

- **Auth:** Supabase Auth med Azure AD/Entra som OAuth-provider (PKCE). Sessionen
  bärs i httpOnly-cookies och uppdateras i `src/proxy.ts`.
- **Roller:** `driver` / `admin`, lagras i `users.role`. Hämtas/ärvs i
  `src/lib/auth.ts` (`getSession`, `requireUser`, `requireAdmin`).
- **Behörighet enforced i app-lagret:** appen pratar med Postgres via en server-side
  direktanslutning (`src/lib/db.ts`), så varje route-handler gör sin egen auth-koll.
  RLS är dessutom påslaget som djupförsvar (se nedan).
- **All databasåtkomst är parametriserad** via `postgres` taggade template-literals →
  ingen SQL-injektion.

## Autentisering per kanal

| Kanal | Mekanism | Var |
| --- | --- | --- |
| Webbsession (förare/admin) | Supabase-cookie → `requireUser`/`requireAdmin` | `src/lib/auth.ts` |
| Cron (veckoöppning, prune) | `CRON_SECRET` (Bearer eller `?secret=`) | `src/app/api/cron/*` |
| Partnerintegration (inkommande) | `INTEGRATION_API_KEY`, **konstant-tids-jämförd** | `src/lib/integration.ts` (`verifyIntegrationKey` → `crypto.timingSafeEqual`) |
| Kalenderfeed | Hemlig per-användar-token i URL:en | `src/app/api/calendar/[token]` |
| VAPID-publik nyckel | Publik (bara den publika nyckeln) | `src/app/api/push/vapid-key` |

## Behörighetsmatris (API-rutter)

**Admin-only (`requireAdmin` → 403 annars):**
`users` GET/DELETE · `users` PATCH `setRole` · `shifts` PUT · `shifts/[id]` PATCH/GET ·
`approvals` POST · `approvals/[id]` DELETE · `applications/[id]/promote|reject|reserve|withdraw` ·
`shifts/[id]/book` · `long-term` GET/POST · `long-term/[id]` DELETE · `long-term/[id]/toggle-date` ·
`long-term/cleanup` · `custom-closed` GET/POST · `custom-closed/[id]` DELETE ·
`export` · `export/preview` · `export/planning` · `export/withdrawals` · `activity` ·
`integration/sync-all`

**Inloggad användare (`requireUser`) + ägarskaps-/privilegiekoll:**
- `applications` POST — bokar alltid för **sin egen** `session.user.id` (aldrig från body).
- `applications/[id]` DELETE — kräver `app.user_id === userId` (eller admin).
- `applications/mine`, `users/me`, `calendar/token` — egen data.
- `users` PATCH (telefon) — bara egen profil om inte admin; `setRole` kräver admin.
- `push/subscribe|unsubscribe|test` — egna prenumerationer (unsubscribe scope:ad till user).
- `weeks`, `shifts/[id]/counts` — inloggad; förare får **inte** sökandelistor (data­minimering).

**Server-till-server / token:**
`integration/bookings` GET · `integration/bookings/[id]/cancel` POST — `INTEGRATION_API_KEY`.
`cron/*` — `CRON_SECRET`. `calendar/[token]` — token.

## Dataskydd

- **Dataminimering:** förarvyn (`weeks`) returnerar inte andra förares ansökningar;
  bara admin får `applicantsByShift`.
- **Kalenderfeeden** exponerar bara den egna förarens pass­tider — **inga namn eller
  telefonnummer** — och nås via en hemlig token (kalenderappar kan inte logga in).
- **Excel-export** (innehåller namn + passhistorik) är strikt `requireAdmin`.
- **Telefonnummer** normaliseras och valideras (`src/lib/phone.ts`, `PHONE_RE`).

## Databas / RLS-hållning

RLS är **påslaget på alla tabeller** med en `service_role`-policy
(`src/lib/db.ts`, migrationsavsnittet). Eftersom appen ansluter server-side med en
betrodd anslutning är RLS här ett **djupförsvar**: det blockerar direkt REST-/anon-
åtkomst mot Supabase-projektet (en läckt anon-nyckel ger ingen data), medan den
faktiska behörigheten upprätthålls i route-handlers. Migrationer är idempotenta och
versionerade engångs-backfills gateas via `schema_migrations`.

> **Inför multi-tenant (senare fas):** när `terminal_id` införs behövs per-terminal
> RLS-policys (eller en instans per terminal) för att isolera terminalernas data.

## Transport, headers & rate limiting

`src/proxy.ts` sätter säkerhetsheaders på alla svar (`X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
`X-Robots-Tag: noindex`) och kör en in-memory sliding-window rate limiter
(auth-rutter strikt, övriga API generöst). Cron-rutter hoppar över sessions-/rate-
logiken men behåller headers.

> **Känd begränsning:** rate limitern är per serverless-isolat (in-memory), inte
> delad över instanser. Räcker mot enkel abuse; för hårdare skydd krävs en delad
> store (t.ex. Upstash/Vercel KV). Spårat, ej brådskande.

## Hemligheter & konfiguration

- Endast `NEXT_PUBLIC_*` (Supabase-URL + anon-nyckel) når klienten. `DATABASE_URL`,
  `CRON_SECRET`, `INTEGRATION_*`, `VAPID_PRIVATE_KEY` m.fl. är server-only.
- Alla variabler dokumenteras i `.env.example`.
- Utgående webhooks signeras med HMAC-SHA256 (`INTEGRATION_WEBHOOK_SECRET`).

## Fynd & åtgärder (denna genomgång)

| # | Fynd | Allvar | Status |
| --- | --- | --- | --- |
| 1 | `push/unsubscribe` raderade per endpoint utan att binda till användaren | Låg | **Åtgärdat** — ny `deleteByEndpointForUser`, scope:ad till session-user |
| 2 | Flera rutter gör `await req.json()` utan try/catch → 500 i st.f. 400 vid trasig body | Låg (robusthet, ej sårbarhet; rutterna är auth:ade) | Spårat — enhetlig felhantering i en kommande runda |
| 3 | `shifts/[id]` PATCH validerar inte body (admin-only, parametriserat) | Låg | Spårat |
| 4 | Beroende-sårbarheter över tid | — | **Åtgärdat** — `Dependabot` (npm + actions, veckovis) i `.github/dependabot.yml` |

**Slutsats:** behörighetsmodellen är solid — inga privilegie-eskalerings- eller
cross-user-läckor hittades. Kvarvarande punkter är robusthets-/härdningsförbättringar,
inte sårbarheter.

## Rapportera en sårbarhet

Mejla elliot.marions@postnord.com. Inkludera steg att återskapa. Logga inte känsliga
detaljer i publika issues.
