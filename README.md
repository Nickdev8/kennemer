## Kennemer Device Panel
Minimal SvelteKit-dashboard voor Shelly-apparaten.

## Snelle URL's
Alleen de zichtbare status bijwerken (geen echte device-call):
```url
http://localhost/api/device-state/callback?deviceId=scene-screen-lokalen&state=off
```

## Devices (Cards) toevoegen of aanpassen
Bewerk `app/src/lib/config/devices.ts`.
- Elke entry in `devices` wordt een card.
- Gebruik een uniek `id`, zet `label` + `group`, en definieer `commands.on/off`.
- `buttonMode` bepaalt de knop: 
  - `toggle`  Aan/Uit in 1 knop.        Leeg/Groen
  - `dual`    Aan + Uit over 2 knoppen  Rood/Groen
  - `single`  1 actie.                  Geen kleur

Minimal voorbeeld:
```ts
{
  id: 'scene-kantine',
  label: 'Kantine',
  group: 'Scene',
  buttonMode: 'toggle',
  commands: {
    on: {
      label: 'Aan',
      cloud: { endpoint: shellySceneEndpoint, method: 'POST', payload: { id: '123', channel: 0, turn: 'on' }, requiresAuthKey: true }
    },
    off: {
      label: 'Uit',
      cloud: { endpoint: shellySceneEndpoint, method: 'POST', payload: { id: '456', channel: 0, turn: 'off' }, requiresAuthKey: true }
    }
  }
}
```

## Advanced devices
Advanced cards staan in `app/src/lib/config/advanced.ts`.
- Werkt hetzelfde als gewone devices, maar ze zijn alleen zichtbaar na de advanced unlock.
- Gebruik dit voor beheer‑only apperaten.

## Scripts
- `restart`: herstart de `odroid-kiosk` systemd-service (dubbele restart).
- `screen`: start/stop de kiosk-stack (Xorg + window manager + Brave kiosk) met watchdog.
Op de Kennemer Odroid:
- `update`: haalt de laatste git-commits op.
- `restart`: herlaadt het scherm zodat updates zichtbaar zijn.
- The folder is located `cd /opt/kennemer/`

## .env (app/.env)
Hier staan runtime-instellingen (niet committen).
Meest gebruikt:
- `SHELLY_AUTH_KEY` = Shelly cloud API key
- `SHELLY_SIMULATE_DEVICES=1` om hardware te simuleren
- `USE_LAN_DEVICES=1` om LAN te prefereren
- `USE_LAN_WATTAGE=1` voor LAN wattage
- `PUBLIC_ADVANCED_PATTERN` of `PUBLIC_ADVANCED_PIN` voor advanced toegang
Template staat in `app/env.temp` — kopieer naar `app/.env`.



https://github.com/user-attachments/assets/829898f8-7536-4730-b2df-8f1d1052f528

https://github.com/user-attachments/assets/df56418f-1570-46dd-a5a5-fe70f3744413
