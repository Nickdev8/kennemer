<div align="center">
  <a href="https://moonshot.hackclub.com" target="_blank">
    <img src="https://hc-cdn.hel1.your-objectstorage.com/s/v3/35ad2be8c916670f3e1ac63c1df04d76a4b337d1_moonshot.png" 
         alt="This project is part of Moonshot, a 4-day hackathon in Florida visiting Kennedy Space Center and Universal Studios!" 
         style="width: 100%;">
  </a>
</div>

## Kennemer Device Panel

Kennemer is a SvelteKit control panel for the school's shared Shelly-powered devices. It polls status data, offers one-click on/off actions, and exposes an advanced area guarded by a PIN for higher-risk equipment. The UI is optimized for a wall tablet but stays responsive on desktop and mobile.

### Highlights
- Real-time Shelly relay status with aggressive polling right after a command succeeds.
- Dual cloud/LAN command paths with automatic fallback plus caching and rate-limit handling.
- Advanced panel that unlocks with an `PUBLIC_ADVANCED_PIN`, keeping sensitive toggles out of sight.
- Optional device simulation (`SHELLY_SIMULATE_DEVICES=1`) so you can develop without touching real hardware.

### Tech Stack
- [SvelteKit](https://kit.svelte.dev/) + [Vite](https://vitejs.dev/) for the app shell and routing.
- Tailwind v4 (via `@tailwindcss/vite`) for styling.
- Custom TypeScript helpers for Shelly HTTP calls, caching, and LAN/cloud selection logic.

### Getting Started
1. **Prereqs** – Node.js 20+ and npm installed locally.
2. **Install deps**
   ```bash
   npm install                    # root helper scripts
   npm install --prefix app       # SvelteKit app + Tailwind plugins
   ```
3. **Configure environment** – Create or edit `app/.env` with the values your Shelly project needs:
   ```env
   SHELLY_AUTH_KEY=your-cloud-api-key
   SHELLY_SIMULATE_DEVICES=1       # set to 0 to talk to the real hardware
   USE_LAN=0                       # turn on to prefer LAN; falls back to cloud if needed
   SHELLY_MAX_API_CALLS=3
   PUBLIC_ADVANCED_PIN=1234
   PUBLIC_COMPACT_WATTAGE=0        # set to 1 to show a compact wattage summary bar
   PUBLIC_DISABLE_WATTAGE=0        # set to 1 to hide wattage completely
   # HTTPS_KEY_PATH=/absolute/path/to/server.key
   # HTTPS_CERT_PATH=/absolute/path/to/server.crt
   # HTTPS_PORT=443
   ```
   Keep this file out of source control if it contains live credentials.
4. **Run the dev server**
   ```bash
   npm run dev
   ```
   The root script proxies into `app/` and launches Vite on `http://localhost:5173`. Use `npm run dev -- --open` to auto-open a browser tab.

### Useful Scripts
- `npm run check` – Type checking via `svelte-check`.
- `npm run lint` / `npm run format` – Prettier in check or write mode.
- `npm run build` – Production build (adapter-node) suitable for the provided Dockerfile.
- `npm run preview` – Preview the production output before deploying.
- `npm run start` – Run the built Node adapter with HTTP plus optional HTTPS.

### HTTPS Support
- Set `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to absolute paths for your key/cert to enable TLS alongside HTTP.
- Override `HTTPS_PORT` (default `443`) and `HTTPS_HOST` if you need different bindings.
- Optional: set `HTTPS_CA_PATH` for custom chains and `HTTPS_PASSPHRASE` if your key is encrypted.
- When the variables are unset the server logs that HTTPS is disabled and only HTTP will be exposed.

#### Docker with HTTPS
- The Docker image now bakes in a self-signed cert at `/certs/server.crt` + `/certs/server.key` and the compose file points the server at it, so `docker compose up --build` exposes both `http://localhost` and `https://localhost` (browser will warn because the cert is self-signed).
- Replace the baked cert with your own by uncommenting the `certs` volume mounts in `docker-compose.yml` and dropping your key/cert files in `./certs` (or point `HTTPS_KEY_PATH`/`HTTPS_CERT_PATH` at another mounted path).
