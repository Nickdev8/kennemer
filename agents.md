# Codex Agent Notes

## Project Overview
- Simple SvelteKit dashboard (frontend + server endpoints) controlling Shelly lighting/screen devices for a school kiosk.
- Runs on Odroid inside Docker; local touchscreen in kiosk mode.
- Primary controls: 8 buttons triggering Shelly HTTP RPC calls (cloud + LAN). Status badge polls device state.

## Stack
- SvelteKit (adapter-node) with TypeScript & Tailwind.
- Server-side utilities in `app/src/lib/server/shelly-http.ts` handle HTTP dispatch, retries, and status parsing.
- Config-driven actions: `app/src/lib/config/devices.ts` defines buttons; `schema.ts` types; config is LAN-first with `.local` hostnames.
- Dockerfile builds via `svelte-kit build`, runtime uses built output (`node build/index.js`).

## Key Environment Vars
- `USE_LAN`: toggle between cloud endpoints and local `.local` RPC calls.
- `SHELLY_AUTH_KEY`: required for cloud endpoints when `USE_LAN` is false (not needed for LAN).

## Common Tasks
1. Updating button actions / adding devices:
   - Edit `app/src/lib/config/devices.ts`; each `cloud`/`lan` entry can be a single target or an array for fan-out.
   - Provide a `status` block per device when you want polling/ badges; the UI keys off the device id.
2. Adjusting Shelly RPC logic: see helper in `app/src/lib/server/shelly-http.ts` (handles rate limit retries & JSON/form payloads).
3. Styling changes: `app/src/routes/+page.svelte` uses Tailwind utilities; adjust button layout/status labels here.
4. Docker rebuild: from repo root run `docker compose up --build web` after `npm install` in `app` to refresh dependencies.

## Pending Follow-ups
- Run `npm install` in `app` to pull `@sveltejs/adapter-node`, then regenerate `package-lock.json` (current lock still references adapter-static).
- Verify LAN `.local` hostnames resolve on the Odroid (ensure Avahi/Bonjour running). Update URLs in `devices.ts` as needed on-site.
- Add real credentials / scene IDs before deployment; config currently contains placeholders for test buttons.

## Other Notes
- Tests: `npm run check` (Svelte check + TypeScript) once dependencies installed.
- Rate limiting: helper auto-retries Shelly cloud 0.5s up to 3 times and marks button cooldown in UI.
- Kiosk service definition provided earlier (`dashboard-kiosk.service`); ensure systemd unit uses the correct URL/port after container deploy.
- Keep `.env`, `config/docker.env` out of git; sample values suggested in commit history (not present yet).
