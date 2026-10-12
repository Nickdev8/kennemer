# Kennemer bedieningspaneel

Dit project is het touchscreen-dashboard voor de verlichting en schermen van
Kennemer. Het draait op een ODROID en bedient Shelly-scenes.

## Dagelijks beheer

Maak verbinding met de ODROID. 
Er is een kant dat geen wachtwoord nodig zal zijn, dat komt omdat je ssh key dan op de odroid al stond:

```bash
ssh root@dashboard.local
```

De belangrijkste commando's zijn:

```bash
update                 # nieuwste versie ophalen en installeren
restart                # alleen het kioskscherm opnieuw starten
screen status          # status van het kioskscherm bekijken
```

De projectmap op de ODROID is `/opt/kennemer`. Voer Docker-commando's vanuit
die map uit:

```bash
cd /opt/kennemer
docker compose ps                    # status van de webapp
docker compose logs --tail=100 web
```

`update` bouwt eerst een nieuwe versie en zet die daarna pas live. Tijdens een
update toont het dashboard een volledig scherm met een update-animatie. Na een
geslaagde update wordt het kioskscherm opnieuw gestart. Dit kan enige tijd een
zwart scherm geven terwijl Xorg en Brave opnieuw opstarten.

## Knoppen aanpassen

De gewone negen knoppen staan in:

```text
app/config/devices.ts
```

De knop **ALLES UIT** staat in:

```text
app/config/triggers.ts
```

De lege knoppen onder geavanceerde bediening staan in:

```text
app/config/advanced.ts
```

Let bij een gewone knop op:

- `pushNumber` bepaalt de positie: 1 linksboven, 9 rechtsonder.
- `commands.on` bevat de scene voor **Aan**.
- `commands.off` bevat de scene voor **Uit**.
- `statusdeviceid` is het Shelly-apparaat waarvan de echte status wordt gelezen.
- Een lege scene-ID maakt een actie bewust niet klikbaar.

In het paneel **Geavanceerde bediening** kunnen scène-ID's runtime worden
aangepast. Hiervoor moet `KENNEMER_CONFIG_EDIT_PIN` in `app/.env` staan. De
wijzigingen worden op de ODROID bewaard in
`/opt/kennemer/runtime/scene-overrides.json` en blijven dus staan na een
update. Alleen bestaande scène-ID's kunnen worden aangepast; de endpoint en
Shelly-sleutel blijven serverconfiguratie.

Test een gewijzigde scene niet zomaar op locatie: een API-call kan echte
verlichting of schermen bedienen.

## Instellingen en wachtwoorden

De lokale instellingen staan in `app/.env`. Dit bestand bevat onder andere de
Shelly API-sleutel en het onderhoudstoken en mag niet in Git komen.

Een overzicht van de beschikbare instellingen staat in `app/.env.example`:

```bash
cp app/.env.example app/.env
```

Vul daarna de echte waarden in. Herstart de app na een wijziging aan `.env`.

## Lokaal ontwikkelen

```bash
cd app
npm ci
npm run dev
```

Controleer wijzigingen voor ze worden uitgerold:

```bash
npm run check
npm run build
```

Voor een lokale productieomgeving vanuit de hoofdmap:

```bash
docker compose up --build -d
```

## Als iets niet werkt

- **Geen dashboard:** controleer `docker compose ps` en de logs van `web`.
- **Zwart scherm:** gebruik `screen status` en daarna eventueel `restart`.
- **Touch werkt niet:** controleer of de USB-kabel ook data ondersteunt en kijk
  naar `systemctl status kennemer-maintenance.service`.
- **Geen internet:** het dashboard blijft bruikbaar met onthouden statussen,
  maar cloud-scenes kunnen pas weer werken wanneer de verbinding terug is.
- **Update blijft hangen:** bekijk
  `systemctl status kennemer-update.service` en
  `journalctl -u kennemer-update.service -n 100`.

De technische architectuur, API-routes en deploydetails staan in
[`AGENTS.md`](AGENTS.md). In belangrijke mappen staat een aanvullende
`AGENTS.md` met regels voor die map.

## Ontwikkelen en controleren

Vanuit `app/`:

```bash
npm run dev              # volledig lokale demo; ontgrendelen/bewerken met 1234
npm run dev:live         # echte Shelly-bediening; vereist echte auth key
npm run validate:config
npm run check
npm run build
npm run test
npm run test:ui
```

De demo doet geen externe aanvragen. Demo- en live-ontwikkelgegevens staan
gescheiden buiten de repository in de locatie die bij starten wordt getoond.
Ze blijven bij een herstart behouden; tijdelijke opslag kan door het systeem
worden opgeschoond. Docker blijft live. Hostonderhoud is geblokkeerd in
`dev:live`. Start geen live acties alleen om code te testen.

De browsertests starten zelf een tijdelijke demo en gebruiken Playwright met
Chrome. Een lokale Chrome-installatie wordt automatisch gevonden. Stel
`CHROME_PATH` in voor een andere installatie of installeer de Playwright-browser
met `npx playwright install chromium`.

`Bediening en tabs beheren` staat in geavanceerde bediening. Wijzig labels,
kleuren, tijdsduren, scene/status-ID's en tabs, bekijk het concept en sla op met
de configuratie-PIN. Opslaan schakelt geen apparatuur. Import/export bevat
alleen instellingen; vorige opslag herstellen herstelt één opgeslagen versie.
De bestaande scene-overrides worden automatisch gelezen als versie 2; de
oorspronkelijke versie blijft bij de eerste opslag als `.bak` bewaard.
Back-ups staan naast het ingestelde bestand: `.bak` en `.previous.json`.

Het apparaat Color spare 051026 is via alleen-lezen discovery geverifieerd als
Gen 3 met `rgbcct:0`. Het tabblad Apparaten ondersteunt LAN Aan/Uit; geen RGB
of helderheidsinstellingen. Schoolbelplanning staat in [todo.md](todo.md).

De Home-nummers lopen van boven naar beneden per kolom:

```text
1 4 7
2 5 8
3 6 9
```

De knoplocaties blijven gelijk. Nummers staan rechts naast de labels. Bestaande
rijgenummerde positie-overrides worden eenmalig omgezet; nieuwe exports noemen
`homeNumbering: column`. De tabkeuze staat boven Geavanceerde bediening, met
blauwe selectie. Bediening beheren staat rechtsonder in het geavanceerde paneel.

## Debuggegevens voor ondersteuning

Open Geavanceerde bediening en druk op het informatie-icoon. Het debugvenster
toont appversie, build-commit, lokale checkout-commit, laatste remote commit met
controletijd, verbinding, touchscreen, hoststatus en apparaatproblemen. Vraag
bij problemen om een foto van dit venster. Onbekende of oude gegevens worden
expliciet vermeld; demo-hashes zijn als simulatie herkenbaar.

De remotecontrole gebruikt alleen `git ls-remote origin` en bewaart het resultaat
60 seconden. Ze doet geen fetch, checkout of update. Advanced openen start geen
automatische updatecontrole. Automatische deployments geven de geteste commit
mee aan de Docker-build. Een handmatige build kan `KENNEMER_BUILD_COMMIT` meekrijgen.

Voor de nieuwe hostdiagnostiek moet na installeren van deze versie de service
`kennemer-maintenance-api.service` herstart zijn. De bestaande installer/update
doet dit; bij een handmatige installatie: `systemctl restart kennemer-maintenance-api.service`.

Bediening beheren heeft één bewerkbaar concept: brede schermen tonen een tabel,
kleinere schermen gegroepeerde velden. De header en opslagknoppen blijven staan
terwijl de inhoud scrolt. Ingeschakeld toont een checkbox met Ja/Nee.
