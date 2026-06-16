# Drift-not — veckoöppning & burst

Snabbguide att ha till hands när en ny vecka öppnas och många anmäler sig samtidigt.

## Vad jag kollar vid första skarpa veckoöppningen

- **Anmälan känns direkt** — chauffören ser "Sökt"/"Intresseanmälan skickad!" utan paus eller dubbletter.
- **Godkännande fastnar inte** — när admin trycker godkänn blir personen kvar som godkänd, även efter att man bytt vy och kommit tillbaka.
- **Inga felmeddelanden** vid normal användning ("Något gick fel", "För många förfrågningar").

## Varningstecken (då klämmer det någonstans)

- Godkännanden hoppar tillbaka till "väntande" efter omladdning.
- "Anmäl intresse" ger fel trots att man är anmäld.
- Allmän tröghet / spinnande laddning under bursten.
- 429 "För många förfrågningar" (rate limit) — ovanligt, men möjligt vid extrem samtidighet.

## Snabba åtgärder om det strular

1. **Uppgradera Supabase till Pro (~$25/mån)** — omedelbar lättnad. Free är den trångaste komponenten; Pro ger mer compute + högre anslutningstak. Detta är första spaken att dra.
2. **Kontrollera i Vercel → Logs** vad felet faktiskt är (timeout, connection, 500) medan det händer — runtime-loggar sparas bara kort, så fånga dem i stunden.
3. **Hör av dig** med vad du såg + ev. loggrader, så kör vi:
   - **Lasttest** mot en slask-Supabase för att mäta exakt var taket ligger (kräver att ett gammalt Supabase-projekt tas bort först — Free tillåter 2 projekt).
   - **B4** — förenkling av den optimistiska UI-logiken (`pendingIds`/snapshots), som är kvarvarande källa till "flicker/hoppar"-buggar om de återkommer.

## Vad som redan är åtgärdat (bakgrund)

- DB-anslutningspool höjd 3 → 10 (grundorsaken till att 8 godkännanden föll bort).
- Twilio-SMS helt borttaget (blockerade anropen, användes inte).
- Anmälan: dubbelklickspärr, 409 hanteras som lyckat, unika temp-id, lättare burst-query.
- Godkännande: typfel (`1 === true`) fixat, rollback hämtar serverns sanning istället för inaktuell ögonblicksbild, godkänn-knappen inte längre tyst avstängd vid full kapacitet.
- Serverless-funktioner flyttade till Dublin (`dub1`) — samma region som databasen, tar bort ~80–100 ms Atlant-latens per query.
- Anslutningssträngen bekräftad använda transaction-poolern (`:6543`).

## Snabbfakta

- **Databas:** Supabase (eu-west-1, Dublin), transaction pooler `:6543`
- **Hosting:** Vercel, funktioner i `dub1`
- **Aviseringar:** Web Push (ej SMS)
- **Pollning:** chaufförsvy var 10:e s, admin var 3:e s

## Hälsolarm för veckoöppningen

För att aldrig mer upptäcka en missad veckoöppning via en chaufför finns en
**dead-man's-switch**: `/api/cron/open-week` pingar `HEALTHCHECK_PING_URL` varje
gång den faktiskt kör en onsdag. Sätt upp så här (engångs):

1. Skapa en gratis check på [Healthchecks.io](https://healthchecks.io) med schema
   "varje onsdag" (period 1 vecka, lite slack för Vercels 1-timmesfönster).
2. Kopiera dess ping-URL till `HEALTHCHECK_PING_URL` i Vercel.
3. Klart — om cronen inte kör en onsdag uteblir pingen och Healthchecks mejlar dig.

Lämnas variabeln tom är pingen en no-op (inget går sönder).
