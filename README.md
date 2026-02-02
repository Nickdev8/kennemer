## Kennemer Device Panel
Minimal SvelteKit dashboard for Shelly devices.

## Quick URLs
Update visible device state (no real device call):
```url
http://localhost/api/device-state/callback?deviceId=scene-screen-lokalen&state=off
```

## Add or Edit Devices (Cards)
Edit `app/src/lib/config/devices.ts`.
- Each entry in `devices` becomes a card.
- Use a unique `id`, set `label` + `group`, then define `commands.on/off`.

Minimal example:
```ts
{
  id: 'scene-screen-lokalen',
  label: 'Screen lokalen',
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

## Scripts
- `restart`: restarts the `odroid-kiosk` systemd service (double restart).
- `screen`: starts/stops the kiosk stack (Xorg + window manager + Brave kiosk) with a watchdog.
On the Kennemer Odroid:
- `update`: pulls the latest git commits.
- `restart`: reloads the screen to pick up updates.

## .env (app/.env)
Put runtime settings here (not committed).
Common keys:
- `SHELLY_AUTH_KEY` = Shelly cloud API key
- `SHELLY_SIMULATE_DEVICES=1` to avoid touching real hardware
- `USE_LAN=1` to prefer LAN calls
- `PUBLIC_ADVANCED_PATTERN` or `PUBLIC_ADVANCED_PIN` for the advanced panel unlock



https://github.com/user-attachments/assets/829898f8-7536-4730-b2df-8f1d1052f528

https://github.com/user-attachments/assets/df56418f-1570-46dd-a5a5-fe70f3744413
