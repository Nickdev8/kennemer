# Operations and Deployment

## Runtime expectations
- Intended to run on a kiosk (Odroid/tablet) with a local touchscreen.
- Primary controls are fast and minimal; advanced controls are gated.

## Environment flags (common)
- `SHELLY_AUTH_KEY`: required for cloud API calls.
- `USE_LAN`: prefer LAN endpoints when set.
- `SHELLY_SIMULATE_DEVICES`: bypass real hardware calls.
- `SHELLY_MAX_API_CALLS`: max rate-limit retries.
- `PUBLIC_ADVANCED_PATTERN` or `PUBLIC_ADVANCED_PIN`: unlock advanced panel.
- `PUBLIC_DISABLE_WATTAGE`, `PUBLIC_COMPACT_WATTAGE`: UI toggles.
- `PUBLIC_DEBUG_WATTAGE`: show wattage diagnostics list in the advanced panel.

## Docker
- Build and run with `docker compose up --build`.
- The Dockerfile builds the SvelteKit adapter output and runs `node build/index.js`.
- HTTPS support is optional; see `README.md` for cert settings.

## Persistent files
- `app/device-states.json`: last-known on/off states per device.
- `app/ips.json`: cached IP list for wattage collection.

## Operational checks
- Confirm LAN hostnames resolve if `USE_LAN=1`.
- Verify Shelly cloud credentials for wattage and device actions.
- Ensure kiosk browser stays on the dashboard URL.
