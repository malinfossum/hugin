# Prosjektnotat — Hugin

Et muntlig sammendrag av prosjektet: hva Hugin er, hva den inneholder, hvor den står og hva jeg ønsker tilbakemelding på. Skrevet for å sies høyt — til en lærer, en medstudent eller en arbeidsgiver — og for å friske opp mitt eget minne når jeg kommer tilbake til prosjektet.

**Sist oppdatert:** 22.09.2026 · **Versjon:** v3.6.1 · **Status:** ferdigstilt og i daglig bruk

---

## Status og hensikt

Hugin er ferdig i den forstand som betyr noe: den gjør jobben sin hver morgen, hos meg. Ti taggede releaser, 278 commits mellom 18. august og 21. september 2026, og 801 tester som alle er grønne — 414 på backend, 387 på frontend. Det ligger en read-only demo ute på Azure. Ingenting står i kø.

Hensikten var aldri å lage et produkt. Den var å slippe å åpne de samme fem sidene hver morgen mens jeg søker jobb. Men den er bygget ordentlig — lagdelt, testet, dokumentert, med spesifikasjon for hver eneste versjon — fordi jeg ville at prosjektet skulle tåle å bli sett på. Det er derfor jeg deler det nå.

Koden er åpen under MIT-lisens. **Jeg håper verktøyet kan være nyttig for flere enn meg** — markedet er det samme for alle som søker utviklerjobb i Norge, og registrene er åpne for alle. Bruk den, riv den fra hverandre, eller ta den i en annen retning. ♥

---

## Kortversjonen (90 sekunder)

> Å søke jobb betydde å åpne de samme fem sidene hver morgen og prøve å huske hva jeg allerede hadde sett. Men dataene er offentlige: NAV har en åpen stillingsfeed, og Brønnøysundregistrene har hvert eneste registrerte foretak. Så jeg bygde noe som tar morgenrunden for meg.
>
> Jeg trykker Synk. Hugin leser fokusprofilen min — hvilke kommuner, hvilke næringskoder, hvilke nøkkelord — henter nye annonser fra NAV, slår opp arbeidsgiverne i Brreg, filtrerer bort det som ikke passer, og viser meg bare det jeg ikke har sett før. Jeg stjernemerker de interessante og setter selskaper til *søkt* etter hvert som jeg søker.
>
> Backend er C# på .NET 10 med EF Core og SQLite. Frontend er React og TypeScript. Det er ett program med to ansikter: en kommandolinje og et web-dashboard som deler samme kjerne og samme database. Hele greia er én selvstendig exe — du dobbeltklikker, og nettleseren åpner seg på localhost. Ingenting å installere, og dataene forlater aldri maskinen.
>
> Den er ferdig og i daglig bruk hos meg. Det jeg egentlig er ute etter nå, er tilbakemelding på grensesnittet: backenden har 800 tester og er gjennomgått, frontenden har bare min egen smak. Og jeg håper den kan være nyttig for flere enn meg — koden er åpen.

**Hvis du bare får ti sekunder:**

> Hugin er en jobbradar for det norske utviklermarkedet. Den følger med på NAV og Brønnøysundregistrene hver morgen, viser meg bare det som er nytt i min region, og holder styr på hvem jeg har søkt hos. Alt kjører lokalt — dataene forlater aldri maskinen min.

---

## Langversjonen (5 minutter)

### 1. Énsetningen — si alltid denne først

> Hugin er en jobbradar for det norske utviklermarkedet. Den følger med på de offentlige registrene hver morgen, forteller meg hva som er nytt i min region, og holder styr på hvem jeg har søkt hos. Den kjører lokalt på min egen maskin — dataene forlater den aldri.

Navnet er en fin krok hvis du vil ha en: Hugin er Odins tankeravn, som flyr ut hver morgen og kommer tilbake med nytt — mens søskenet Munin husker.

### 2. Hvorfor den finnes

> Å søke jobb i Innlandet betydde å åpne de samme fem sidene hver morgen og prøve å huske hva jeg allerede hadde sett. Men dataene er jo offentlige — NAV publiserer en åpen stillingsfeed, og Brønnøysundregistrene publiserer hvert eneste registrerte foretak. Så i stedet for å sjekke manuelt lar jeg et program ta morgenrunden, og så viser det meg bare differansen: hva som er nytt siden sist.

### 3. Hvordan den faktisk funker — morgenrunden

Fortell det som en historie, i denne rekkefølgen. Dette er bokstavelig talt flyten i koden:

> Jeg trykker Synk. Hugin leser fokusprofilen min — hvilke kommuner, hvilke næringskoder, hvilke nøkkelord. Så henter den nye stillingsannonser fra NAVs feed og slår opp arbeidsgiverne i Brønnøysundregistrene. Den filtrerer: kommune er en hard sperre, nøkkelord snevrer inn tittelen, og NAVs egen yrkeskategori luker ut tilfeldige treff. Det som overlever, blir lagret. Så viser den meg bare det jeg ikke har sett før. Jeg stjernemerker de interessante, setter et selskap til *søkt*, eksporterer en kortliste, og markerer bunken som sett. Neste morgen starter den fra det merket.

Hvis noen spør hvordan den vet hva som er nytt: det ligger et review-merke i databasen — et tidsstempel for sist jeg sa «dette har jeg sett». Alt etter det er nytt.

### 4. Stacken, i den rekkefølgen folk forventer

> Backend er C# på .NET 10, med EF Core over SQLite, testet med NUnit. Frontend er React 19 med TypeScript, bygget med Vite og testet med Vitest. Hele greia leveres som én selvstendig .exe — du dobbeltklikker, nettleseren åpner seg på localhost, og det er ingenting å installere. Ingen .NET-runtime, ingen databaseserver.

Arkitekturen, hvis de spør — fire prosjekter, og avhengighetspilene peker alltid innover:

- **Hugin.Core** — det rene domenet. Modeller, filtre, synk-logikken, tjenestene. Ingen database, ingen HTTP, ingen filsystem. Bare grensesnitt den forventer at noen andre implementerer.
- **Hugin.Infrastructure** — implementasjonene. EF Core-konteksten og migrasjonene, HTTP-klientene mot Brreg og NAV, lesing av konfigfila.
- **Hugin.Console** og **Hugin.Api** — to tynne verter over den samme kjernen. Én er et kommandolinjeverktøy, én er en webserver. Ingen av dem inneholder forretningslogikk.
- **Hugin.Tests** — og dette er linja det er verdt å si høyt: testprosjektet er større enn alle de fire produksjonsprosjektene til sammen.

### 5. Hvordan API-et funker

> Dashboardet er en single-page React-app som snakker med et lite JSON-API i samme prosess. ASP.NET Core minimal APIs, rundt femten lese-endepunkter og et dusin skrive-endepunkter, alle mot den samme SQLite-fila som kommandolinja bruker. Så CLI-en og dashboardet er faktisk to ansikter på ett program — ikke to programmer som synker mot hverandre.

De to designvalgene jeg ville fremhevet:

**Hver visning er en ekte URL.** `/companies/912345678` er en lenke du kan bokmerke, laste på nytt og dele. Fram og tilbake i nettleseren funker. Jeg skrev routeren selv — rundt tretti linjer, parse og format, begge rene funksjoner — i stedet for å dra inn et routing-bibliotek for fem ruter.

**Sikkerhet på et localhost-API er ikke ingenting.** Localhost er ingen grense: hvilken som helst nettside du besøker kan fyre av forespørsler mot `http://localhost:5111`, og DNS rebinding kan lese svaret tilbake. Så Hugin sjekker Host-headeren og avviser alt som ikke er localhost, og hver forespørsel som endrer noe må ha en `X-Hugin: 1`-header. Det er CSRF-beskyttelse, ikke autentisering — en tilfeldig nettside får ikke satt en egen header, men en lokal prosess jeg allerede stoler på får det.

### 6. To detaljer som viser vurdering, ikke bare kode

Velg én, avhengig av rommet:

**Synk er at-least-once, med vilje.** Skrivingene er idempotente, og feed-markøren flyttes først etter at en side faktisk er lagret. Så hvis den krasjer halvveis, henter neste kjøring den siden om igjen i stedet for å hoppe stille over den. Duplikater er billige; en tapt stillingsannonse er ikke det.

**Utgåtte annonser er et juridisk krav, ikke en finesse.** NAVs API-vilkår sier at en videreformidlet annonse skal fjernes straks den blir inaktiv. Derfor blir en annonse som har passert fristen aldri presentert som aktiv — det kjører et lokalt utløpssveip ved hver synk, og et selskap der alle annonsene har gått ut flytter seg selv til en *Utgått*-kolonne, og tilbake igjen hvis det dukker opp en ny annonse. Jeg leste vilkårene før jeg bygde funksjonen, og demoen filtrerer bort lukkede annonser helt.

### 7. Demoen

> Det kjører en read-only-versjon på Azure App Service på **hugin-demo.azurewebsites.net** — ekte annonser og selskaper fra Innlandet, en seedet eksempelpipeline, ingen persondata. Samme binærfil, startet med et `--public`-flagg som avviser all skriving. Første lasting etter at den har stått stille tar noen sekunder; det er gratisnivået.

### 8. Spørsmålet — her stopper du og gir stafettpinnen videre

> Den er ferdig i den forstand at den gjør det jeg trenger hver morgen. Det jeg ikke har fått et annet par øyne på, er grensesnittet. Backenden fikk tester og reviews; frontenden fikk min egen smak og ingenting annet. Så det jeg virkelig ønsker meg, er ærlig tilbakemelding på UI-et — layout, hierarki, om dashboardet faktisk forteller deg det viktigste først. Og hvis noen vil åpne en PR med et bedre design, så er repoet åpent, og jeg tar oppriktig gjerne imot. Jeg håper den kan være nyttig for flere enn meg.

---

## Juksekort — spørsmålene som kommer

| Hvis de spør | Svar |
|---|---|
| «Hvorfor ikke et rammeverk som Next?» | Det er en lokal app, ikke en nettside. React pluss to avhengigheter totalt; alt annet er standardbiblioteket. |
| «Hvorfor SQLite?» | Én bruker, én fil, null oppsett. Den ligger ved siden av exe-en og tar backup av seg selv før hver migrasjon. |
| «Hvorfor både CLI og web?» | CLI-en kom først, og er fortsatt den raskeste morgensjekken. Samme kjerne, samme database — dashboardet er en ekstra vert, ikke en omskriving. |
| «Hvor stor er den?» | Rundt 7 000 linjer C# og 14 000 linjer frontend, tester inkludert. 801 tester, alle grønne. |
| «Kan den scrape finn.no?» | Nei — og verken finn eller proff tillater det. Det er lenker jeg klikker manuelt, listet som Kilder i appen. Ærlige begrensninger slår en scraper som knekker. |
| «Hvem kan bruke den?» | Hvem som helst. MIT-lisens, ferdigbygde exe-er under Releases, og den spør hvilken del av Norge du vil følge første gang du starter den. |

---

## Hva jeg ønsker tilbakemelding på

I prioritert rekkefølge:

1. **Grensesnittet.** Layout, hierarki, typografi, farger. Forteller dashboardet deg det viktigste først? Dette er den svakeste delen, og den jeg har minst avstand til.
2. **Informasjonsarkitekturen.** Fem visninger: dashboard, bedrifter, søknader, eksport, innstillinger. Er det riktig oppdeling, eller er det bare min egen vane?
3. **Arkitekturen.** Er lagdelingen ryddig nok, eller har jeg overkomplisert for en app med én bruker?
4. **Det jeg ikke ser.** Det som får en erfaren utvikler til å heve øyenbrynet.

Bidrag er velkomne — repoet er åpent, og en PR med et bedre design er det beste jeg kan få.

**Lenker:** demo på hugin-demo.azurewebsites.net · kode og releaser på github.com/malinfossum/hugin · spesifikasjon for hver versjon under `docs/specs/`
