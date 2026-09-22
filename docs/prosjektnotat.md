# Prosjektnotat — Hugin

Et sammendrag av hva Hugin er, hvordan den fungerer, hvordan den er bygget og hvor den står.

**Sist oppdatert:** 23.09.2026 · **Versjon:** v3.6.1 · **Status:** ferdigstilt og i daglig bruk

---

## Kort fortalt

Hugin er en jobbradar for det norske utviklermarkedet. Den følger med på de offentlige
registrene hver morgen, viser hva som er nytt i din region, og holder styr på hvem du har søkt
hos. Den kjører lokalt på din egen maskin, og dataene forlater den aldri.

Navnet kommer fra Odins tankeravn, som flyr ut hver morgen og kommer tilbake med nytt — mens
søskenet Munin husker.

## Bakgrunn

Å søke jobb betydde å åpne de samme fem sidene hver morgen og prøve å huske hva jeg allerede
hadde sett. Dataene er offentlige: NAV publiserer en åpen stillingsfeed, og
Brønnøysundregistrene publiserer hvert eneste registrerte foretak. I stedet for å sjekke
manuelt lar jeg et program ta morgenrunden og vise bare differansen — det som er nytt siden
sist.

## Slik fungerer en morgenrunde

Du starter en synk. Hugin leser fokusprofilen — hvilke kommuner, hvilke næringskoder, hvilke
nøkkelord — og henter nye stillingsannonser fra NAVs feed. Arbeidsgiverne slås opp i
Brønnøysundregistrene.

Deretter filtreres annonsene: kommune er en hard sperre, nøkkelord snevrer inn tittelen, og
NAVs egen yrkeskategori luker ut tilfeldige treff. Det som overlever, blir lagret.

Til slutt vises bare det som ikke har vært vist før. Du stjernemerker de interessante, setter
et selskap til *søkt*, eksporterer en kortliste og markerer bunken som sett. Neste morgen
starter Hugin fra det merket — et tidsstempel i databasen for sist noen sa «dette er sett».

## Stack

Backend er C# på .NET 10, med EF Core over SQLite, testet med NUnit. Frontend er React 19 med
TypeScript, bygget med Vite og testet med Vitest.

Hele applikasjonen leveres som én selvstendig `.exe`. Du dobbeltklikker, nettleseren åpner seg
på localhost, og det er ingenting å installere — ingen .NET-runtime, ingen databaseserver.

## Arkitektur

Fire prosjekter, der avhengighetene bare peker innover:

- **Hugin.Core** — det rene domenet. Modeller, filtre, synk-logikk og tjenester. Ingen
  database, ingen HTTP, intet filsystem; bare grensesnitt som andre lag implementerer.
- **Hugin.Infrastructure** — implementasjonene. EF Core-konteksten og migrasjonene,
  HTTP-klientene mot Brreg og NAV, og lesing av konfigurasjonsfila.
- **Hugin.Console** og **Hugin.Api** — to tynne verter over den samme kjernen. Én er et
  kommandolinjeverktøy, én er en webserver. Ingen av dem inneholder forretningslogikk.
- **Hugin.Tests** — testprosjektet, som er større enn de fire produksjonsprosjektene til
  sammen.

## API-et

Dashboardet er en single-page React-app som snakker med et JSON-API i samme prosess: ASP.NET
Core minimal APIs, rundt femten lese-endepunkter og et dusin skrive-endepunkter, alle mot den
samme SQLite-fila som kommandolinja bruker. CLI-en og dashboardet er dermed to ansikter på ett
program, ikke to programmer som synkroniserer seg mot hverandre.

**Hver visning er en ekte URL.** `/companies/912345678` kan bokmerkes, lastes på nytt og deles,
og fram og tilbake i nettleseren fungerer. Ruteren er skrevet for hånd — rundt tretti linjer,
parse og format som rene funksjoner — framfor et routing-bibliotek for fem ruter.

**Localhost er ingen sikkerhetsgrense.** Hvilken som helst nettside kan sende forespørsler mot
`http://localhost:5111`, og DNS rebinding kan lese svaret tilbake. Hugin sjekker derfor
Host-headeren og avviser alt som ikke er localhost, og hver forespørsel som endrer tilstand må
sende en `X-Hugin: 1`-header. Det er CSRF-beskyttelse, ikke autentisering: en tilfeldig
nettside får ikke satt en egen header, mens en lokal prosess som allerede er betrodd får det.

## To valg verdt å forklare

**Synk er at-least-once, med vilje.** Skrivingene er idempotente, og feed-markøren flyttes
først etter at en side faktisk er lagret. Krasjer synken halvveis, hentes den siden om igjen
ved neste kjøring i stedet for å bli hoppet stille over. Duplikater er billige; en tapt
stillingsannonse er det ikke.

**Utgåtte annonser er et krav, ikke en finesse.** NAVs API-vilkår sier at en videreformidlet
annonse skal fjernes straks den blir inaktiv. En annonse som har passert fristen presenteres
derfor aldri som aktiv: hver synk kjører et lokalt utløpssveip, og et selskap der alle
annonsene har gått ut flyttes til en *Utgått*-seksjon — og tilbake igjen hvis en ny annonse
dukker opp. Demoen filtrerer bort lukkede annonser helt.

## Demo

En read-only versjon kjører på Azure App Service:
[hugin-demo.azurewebsites.net](https://hugin-demo.azurewebsites.net). Den viser ekte annonser
og selskaper fra Innlandet med en seedet eksempelpipeline, uten persondata og uten sporing.
Det er samme binærfil som resten, startet med et `--public`-flagg som avviser all skriving.
Første lasting etter en tid med inaktivitet tar noen sekunder — den ligger på gratisnivået.

## Status

Hugin er ferdigstilt på v3.6.1 og i daglig bruk. Ti taggede releaser, 278 commits mellom
18. august og 21. september 2026, og 801 tester som alle er grønne: 414 på backend, 387 på
frontend. Hver versjon har en spesifikasjon skrevet på forhånd, under `docs/specs/`.

Hensikten var aldri å lage et produkt, men å slippe den manuelle morgenrunden. Den er likevel
bygget ordentlig — lagdelt, testet og dokumentert — fordi prosjektet skulle tåle å bli sett på.

## Vanlige spørsmål

| Spørsmål | Svar |
|---|---|
| Hvorfor ikke et rammeverk som Next? | Dette er en lokal applikasjon, ikke en nettside. React pluss to avhengigheter totalt; alt annet er standardbiblioteket. |
| Hvorfor SQLite? | Én bruker, én fil, null oppsett. Databasen ligger ved siden av exe-en og sikkerhetskopierer seg selv før hver migrasjon. |
| Hvorfor både CLI og web? | Kommandolinja kom først og er fortsatt den raskeste morgensjekken. Dashboardet er en ekstra vert over samme kjerne og samme database, ikke en omskriving. |
| Hvor stor er kodebasen? | Rundt 7 000 linjer C# produksjonskode, 7 700 linjer testkode og 14 000 linjer frontend. |
| Henter den fra finn.no? | Nei. Verken finn.no eller proff.no tillater skraping, så de ligger som lenker under Kilder i appen og klikkes manuelt. |
| Hvem kan bruke den? | Hvem som helst. MIT-lisens, ferdigbygde exe-er under Releases, og den spør hvilken del av Norge du vil følge første gang den startes. |

## Tilbakemelding og bidrag

Tilbakemelding er velkommen, særlig på disse punktene:

1. **Grensesnittet** — layout, hierarki, typografi og farger. Forteller dashboardet det
   viktigste først? Backenden har fått tester og gjennomganger; frontenden har i praksis bare
   fått min egen smak, så det er her et par andre øyne er mest verdt.
2. **Informasjonsarkitekturen** — fem visninger: dashboard, bedrifter, søknader, eksport og
   innstillinger. Er det riktig oppdeling?
3. **Arkitekturen** — er lagdelingen ryddig nok, eller overkomplisert for en applikasjon med
   én bruker?

Koden er åpen under MIT-lisens, og pull requests er velkomne — særlig på design. Jeg håper
verktøyet kan være nyttig for flere enn meg: markedet er det samme for alle som søker
utviklerjobb i Norge, og registrene er åpne for alle.

**Lenker:** [demo](https://hugin-demo.azurewebsites.net) ·
[kode og releaser](https://github.com/malinfossum/hugin) · spesifikasjoner under `docs/specs/`
