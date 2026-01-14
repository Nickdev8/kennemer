# Kennemer Device Panel Overview

## What this project is for
Kennemer is a SvelteKit dashboard used on a wall tablet (kiosk) to control Shelly-powered devices in a school. It focuses on simple on/off scenes, wattage visibility, and a gated advanced panel for higher-risk controls.

## How it works (high level)
- UI renders device cards and buttons from config in `app/src/lib/config`.
- Button press calls `POST /actions` via `app/src/lib/api.ts`.
- Server routes to `app/src/routes/actions/+server.ts`, which dispatches Shelly HTTP calls via `app/src/lib/server/shelly-http.ts` and updates the local state cache.
- Device states are persisted to `app/device-states.json`, loaded on page start via `GET /api/device-state`, and updated live over `GET /api/device-state/stream` (SSE).
- Wattage totals come from `GET /api/wattage/[room]`, which fetches device lists from Shelly Cloud, caches IPs in `app/ips.json`, and then queries LAN endpoints (Gen2 RPC or legacy `/status`) per device with a cloud fallback.

## UX behavior
- Primary dashboard is optimized for a kiosk: minimal navigation, fast feedback.
- Advanced panel is protected by a draw pattern (PIN fallback), auto-closes after inactivity, and closes on outside click.

## Key features to know
- Cloud vs LAN targeting is config-driven and toggled with env flags.
- Scene commands always use Shelly Cloud and are sent as form-encoded requests.
- Button visuals can be neutral, on/off themed, or hex-colored with optional border overrides.
- Simulated mode avoids real hardware calls for local development.
