# Development Guide

## Quick start
1. Install dependencies:
   - `npm install`
   - `npm install --prefix app`
2. Create `app/.env` with your Shelly credentials and flags (see `README.md`).
3. Run the dev server:
   - `npm run dev`

## Common changes
- Add or adjust buttons:
  - Edit `app/src/lib/config/devices.ts` (primary) or `app/src/lib/config/advanced.ts` (advanced).
  - Each command can target LAN or cloud, optionally as an array for fan-out.
  - Visuals: `type` can be `on`, `off`, `none`, or a hex color, plus `typeBorder`.
  - Advanced triggers live next to advanced devices in `app/src/lib/config/advanced.ts`.
- Update UI layout and interaction:
  - Edit `app/src/routes/+page.svelte`.
  - Device card behavior is in `app/src/lib/components/device-card.svelte`.
- Change Shelly HTTP/RPC behavior:
  - Update `app/src/lib/server/shelly-http.ts` for retry, auth, request formats.
  - Update `app/src/lib/server/shelly-rpc.ts` for Gen2 RPC wattage reads.
- Adjust wattage logic and caching:
  - `app/src/routes/api/wattage/[room]/+server.ts` for parsing and room selection.
  - `app/src/routes/api/wattage/cache/+server.ts` for cache invalidation.

## Local development tips
- Use `SHELLY_SIMULATE_DEVICES=1` to avoid real hardware calls.
- When debugging state issues, inspect `app/device-states.json`.
- If wattage appears stale, clear `app/ips.json` via `POST /api/wattage/cache`.

## When extending the project
- Follow the flow: UI -> `POST /actions` -> Shelly HTTP -> persisted state -> UI refresh.
- Keep device IDs stable; they are used as keys in the state cache.
- Add new config types to `app/src/lib/config/schema.ts` before using them in devices.
