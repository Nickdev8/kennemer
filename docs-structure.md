# Project Structure

## Root
- `Dockerfile`: builds the SvelteKit app into a Node runtime image.
- `docker-compose.yml`: local/dev container config; exposes HTTP/HTTPS.
- `package.json`: root scripts that proxy into `app/`.
- `README.md`: setup, environment, and usage notes.
- `app/`: the SvelteKit application (source, build output, runtime artifacts).

## app/
- `package.json`: app-level dependencies and scripts.
- `server.js`: Node entry for the SvelteKit adapter build.
- `device-states.json`: persisted last-known button states.
- `ips.json`: cached Shelly device IP list for wattage queries.
- `static/`: static assets served as-is.
- `src/`: application code.

## app/src
- `routes/+page.svelte`: main dashboard UI and advanced panel.
- `routes/+page.ts`: initial load of device states.
- `routes/actions/+server.ts`: POST endpoint to trigger device commands.
- `routes/api/device-state/+server.ts`: GET endpoint for cached device states.
- `routes/api/wattage/[room]/+server.ts`: wattage data collection + IP caching.
- `routes/api/wattage/cache/+server.ts`: clears cached IPs.

## app/src/lib
- `config/`: device definitions and schema.
  - `devices.ts`: primary dashboard device list and commands.
  - `advanced-devices.ts`: advanced panel device list.
  - `schema.ts`: types for device/command configuration.
- `components/device-card.svelte`: main button card UI.
- `api.ts`: browser helper for `POST /actions`.
- `server/shelly-http.ts`: LAN/cloud request dispatch, auth, retries.
- `server/device-state-store.ts`: read/write persisted device state.
