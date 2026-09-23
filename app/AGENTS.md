# Application guide

These instructions cover everything below `app/`. Also follow the repository
root `AGENTS.md`.

## Stack and entry points

The application is SvelteKit 2 with Svelte 5, TypeScript, Tailwind CSS, and
`@sveltejs/adapter-node`.

- `src/routes/+page.svelte` owns the dashboard layout and orchestration.
- `src/lib/components/device-card.svelte` renders configured device controls.
- `src/lib/components/trigger-card.svelte` renders stateless triggers.
- `src/routes/+page.ts` loads the initial remembered device state.
- `server.js` wraps the generated Node handler and adds HTTP/HTTPS plus
  `/healthz`.
- `config/` is the human-edited control configuration.

Import aliases are declared in `svelte.config.js`:

- `$config` points to `app/config`.
- `$lib` points to `app/src/lib`.

## Main page responsibilities

`+page.svelte` currently coordinates:

- the 3-by-3 device grid;
- advanced pattern entry and the pin-able advanced panel;
- confirmation and dispatch of **ALLES UIT**;
- initial state, SSE updates, and repeated device-status polling;
- wattage summaries and optional diagnostics;
- connection and touchscreen health banners;
- update status and the full-screen update view;
- idle detection, black overlay, and first-touch wake suppression.

This is a touch kiosk, not a desktop admin site. Keep targets large, text
plain, contrast strong, and interactions understandable without instructions.
Avoid large layout changes unless the user explicitly approves them.

State polling is intentionally quick enough to reflect third-party Shelly
changes. The normal status loop is approximately five seconds, with additional
checks after dashboard actions. Do not lengthen it casually. Consider Shelly
rate limits before shortening it.

## UI invariants

- On is green; off is neutral. Do not invert the labels or colors.
- Toggle labels are Dutch: `Aan` turns on and `Uit` turns off.
- Device cards show no polling or permanent `Status: Aan/Uit` text because card
  color carries the state.
- A newly unreachable status device produces one temporary warning at the top
  right only after two consecutive failed polls. A successful poll immediately
  resets its failure count. Do not renew the warning on every polling cycle
  while the same device remains unavailable.
- Offline status does not disable a configured scene action.
- Missing command payloads do disable the corresponding action.
- Advanced controls auto-close after inactivity unless pinned.
- Pinning is temporary; reopening the panel starts unpinned.
- An update keeps the advanced panel from disappearing and then covers the
  whole page with a clear progress view.
- When idle, the black overlay is visually at zero brightness. The wake touch
  is consumed and cannot press a button beneath it.
- While the idle overlay is active, pause device-status, connectivity, wattage,
  hardware polling, and the local SSE stream. Wake must immediately refresh
  each source, reconnect SSE, and restart normal schedules. Do not pause active
  update-progress polling.

## Server/browser boundary

Secrets and Shelly requests belong in server routes. Do not expose
`SHELLY_AUTH_KEY` or `KENNEMER_MAINTENANCE_TOKEN` through page data or browser
code. Only variables intentionally prefixed with `PUBLIC_` may be used through
SvelteKit's public environment module.

The browser submits configured IDs to server endpoints. Server routes resolve
those IDs against imported config and reject arbitrary targets.

## State ownership

There are three related but distinct kinds of state:

- UI transition state, such as loading or a pressed button.
- Remembered server action state in `device-states.json`.
- Physical relay state read through `statusdeviceid`.

Physical state wins when available. Remembered server state keeps the UI useful
when a status device is offline. A successful click may update the remembered
state, but it must not prevent later physical status from correcting the UI.

## Commands

Run from this directory:

```bash
npm ci
npm run check
npm run build
npm run lint
npm run dev
```

`npm run dev` is for local development. Production uses `npm run build` in the
Docker image and starts the built output through `server.js`.

Do not run Prettier over the entire application as part of an unrelated change;
it can create a noisy diff. Format only touched files when necessary.

## Runtime files

Do not commit or depend on development copies of:

- `.env`
- `device-states.json`
- `ips.json`
- `.svelte-kit/`
- `build/`
- `node_modules/`

`.env.example` is the documented, non-secret template and should be updated when a
new environment variable becomes operationally relevant.
