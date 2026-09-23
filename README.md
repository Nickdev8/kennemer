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
wijzigingen worden in de Docker-volume onder `/data` bewaard en blijven dus
staan na een update. Alleen bestaande scène-ID's kunnen worden aangepast; de
endpoint en Shelly-sleutel blijven serverconfiguratie.

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
