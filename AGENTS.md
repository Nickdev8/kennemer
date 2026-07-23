# Kennemer project guide for AI agents

This file is the detailed technical source of truth for agents working in this
repository. `README.md` is intentionally shorter and written for human
maintainers. Read the closest nested `AGENTS.md` before editing files in a
subdirectory; nested instructions add to this file and take precedence for
their scope.

## Mission

Kennemer is a Dutch, touch-first control dashboard installed on an ODROID. It
controls Shelly scenes for lights and projection screens, shows live or
remembered device state, displays aggregate power consumption, and exposes
limited maintenance controls. The page is permanently displayed in a Brave
kiosk on the ODROID's HDMI touchscreen.

Reliability and clarity are more important than adding abstraction. A person
with little technical knowledge must be able to operate the dashboard.

## Runtime topology

```text
Touchscreen
    |
Brave kiosk + Openbox + Xorg (:0)
    |
SvelteKit app in Docker (HTTP 80, HTTPS 443)
    |                         |
Shelly LAN / Shelly Cloud     Host maintenance API (:8787)
                                  |
                         systemd, update, USB checks
```

The production checkout is `/opt/kennemer` on the ODROID.

- `docker-compose.yml` runs the `web` service as image `kennemer:prod`.
- `Dockerfile` builds the SvelteKit adapter-node application.
- `app/server.js` serves HTTP, `/healthz`, and optional HTTPS.
- `odroid-kiosk.service` runs the physical display stack.
- `kennemer-app.service` supervises the Docker application.
- `kennemer-maintenance.service` exposes authenticated update and hardware
  status endpoints to the container.
- `kennemer-update.service` performs the safe deployment.

The Docker container reaches the host API through
`http://host.docker.internal:8787`. The browser never receives the maintenance
token.

## Repository map

```text
.
├── app/
│   ├── config/                 Operator-facing button configuration
│   ├── src/lib/components/     Reusable Svelte UI components
│   ├── src/lib/config/         Config schemas and import shims
│   ├── src/lib/server/         Shelly calls, state storage, SSE helpers
│   ├── src/routes/             Main page and server API endpoints
│   ├── env.temp                Safe environment template
│   └── server.js               Production HTTP/HTTPS wrapper
├── odroid/                     Host scripts and systemd units
├── Dockerfile                  Production image build
├── docker-compose.yml          Production container definition
├── README.md                   Short maintainer guide
└── AGENTS.md                   This technical guide
```

Additional instructions:

- `app/AGENTS.md` covers SvelteKit development and UI behavior.
- `app/config/AGENTS.md` documents the configuration contract.
- `app/src/routes/AGENTS.md` documents every application endpoint.
- `app/src/lib/server/AGENTS.md` documents Shelly transport and state logic.
- `odroid/AGENTS.md` documents installation, kiosk services, and updates.

## Control model

The dashboard is configuration-driven. The primary source is
`app/config/devices.ts`; the files below `app/src/lib/config/` re-export the
root config and define its TypeScript schema.

The normal 3-by-3 grid currently contains:

| Position | Label          | Behavior                           |
| -------- | -------------- | ---------------------------------- |
| 1        | 1ste etage     | On/off scene toggle                |
| 2        | Aula plafond   | On/off scene toggle                |
| 3        | Gang + entree  | On/off scene toggle                |
| 4        | 1ste           | On/off scene toggle                |
| 5        | Screen lokalen | Stateless `Screens omhoog` trigger |
| 6        | Kantine        | On/off scene toggle                |
| 7        | Parterre       | On/off scene toggle                |
| 8        | Aula vide      | On/off scene toggle                |
| 9        | Kopje          | On/off scene toggle                |

`pushNumber`, not source-array position, defines the grid position. Keep values
unique and within 1 through 9.

Every toggle has two independent Shelly scene IDs:

- `commands.on` means **Aan** and results in the green state.
- `commands.off` means **Uit** and results in the neutral/off state.

The central screen button is `single` and `stateless`; it fires a scene but
must not pretend to know a persistent on/off state.

The red **ALLES UIT** button is configured in `app/config/triggers.ts`. The UI
asks `Ja` or `Nee`; only confirmation may call its scene.

Advanced controls are intentionally placeholders in
`app/config/advanced.ts`. Empty actions are disabled and must remain harmless
until real IDs are deliberately configured.

## Device status model

A scene activation and a physical relay state are different facts. The UI uses
this priority:

1. A fresh reading from `statusdeviceid`.
2. The last action remembered by the server.
3. `off` as the safe display fallback.

On initial load, a configured status device briefly displays `Pingen...` during
the first request. Permanent `Status: Aan/Uit` copy is intentionally omitted;
the card color communicates the result. An unreachable status device does not
disable a properly configured scene button. Instead, the UI briefly warns that
the push-button panel was not found and the displayed state is less reliable.
The UI remains operable and the server remembers the last successful dashboard
action.

The browser requests device output roughly every five seconds and schedules
extra checks after an action. `app/src/routes/api/device-output/+server.ts`
tries the cached LAN IP first and Shelly Cloud second. IDs can include a
channel suffix, for example `2043a80ac3e4_1`.

`app/src/lib/server/device-state-store.ts` atomically stores remembered states
in `device-states.json`. `app/src/lib/server/device-state-events.ts` publishes
changes over server-sent events. Do not replace the real status priority with
optimistic browser-only state.

## Action path

```text
DeviceCard click
    -> POST /actions
    -> validate against current config
    -> sendDeviceCommand()
    -> Shelly Cloud scene or configured LAN target
    -> persist non-stateless action
    -> publish SSE state
    -> browser performs follow-up status reads
```

Trigger cards use `POST /triggers`. Server routes only accept IDs and commands
that exist in config; clients cannot submit arbitrary URLs.

Scene targets always use Shelly Cloud because the configured endpoint is a
Shelly scene API. `USE_LAN_DEVICES=1` only prefers LAN when a command actually
provides a LAN target.

## Wattage, connectivity, and idle behavior

- `/api/wattage/[room]` reads Shelly devices and aggregates room `-1` for the
  dashboard total. It prefers LAN when configured and falls back as supported.
- `/api/wattage/cache` maintains the device-to-IP cache in `ips.json`.
- `/api/connectivity` performs a short request to Shelly Cloud. The frontend
  uses it for the obvious no-connection warning.
- `/api/hardware` proxies the host maintenance service and reports whether the
  expected touchscreen USB ID is present.
- The physical display is deliberately kept awake. After the configured idle
  timeout, the web UI draws a black overlay (zero visible brightness). The
  first touch only wakes the UI and must never activate the control underneath.

## Update path

The browser calls `/api/update`, which proxies the authenticated host
maintenance service. That service starts `kennemer-update.service`.

The update script:

1. Fetches `origin/main`.
2. Refuses non-fast-forward deployment.
3. Creates a candidate worktree under `/var/lib/kennemer/candidate`.
4. Builds a candidate Docker image.
5. Keeps the previous image as `kennemer:rollback`.
6. Starts the candidate and waits for `/healthz`.
7. Rolls back automatically if health checks fail.
8. Moves the production checkout to the tested commit.
9. Refreshes maintenance command links and restarts the kiosk.

Even a no-change update restarts the kiosk. A temporary black screen is
expected while Xorg and Brave return. Do not simplify the update script in a
way that removes candidate builds, health checks, or rollback.

Important: the deploy script resets the production checkout to the tested
remote commit. Never use `/opt/kennemer` as a place for uncommitted production
edits. Make changes in a development checkout, commit and push them, then run
`update`.

## Environment

`app/.env` is runtime-only and ignored by Git. Start from `app/env.temp`.

Main variables:

| Variable                         | Meaning                                      |
| -------------------------------- | -------------------------------------------- |
| `SHELLY_AUTH_KEY`                | Shelly Cloud authentication key              |
| `SHELLY_SIMULATE_DEVICES`        | Skip real calls and return simulated success |
| `USE_LAN_DEVICES`                | Prefer configured LAN action targets         |
| `USE_LAN_WATTAGE`                | Prefer LAN for power reads                   |
| `SHELLY_MAX_API_CALLS`           | Cloud rate-limit retry count                 |
| `DEVICE_STATE_PATH`              | Optional remembered-state file path          |
| `KENNEMER_MAINTENANCE_TOKEN`     | Shared container-to-host API secret          |
| `KENNEMER_MAINTENANCE_URL`       | Host maintenance API URL                     |
| `PUBLIC_ADVANCED_PATTERN`        | Comma-separated unlock patterns              |
| `PUBLIC_ADVANCED_PIN`            | Backward-compatible additional unlock value  |
| `PUBLIC_DISABLE_WATTAGE`         | Hide and stop wattage requests               |
| `PUBLIC_DEBUG_WATTAGE`           | Show detailed wattage diagnostics            |
| `PUBLIC_DISPLAY_DIM_TIMEOUT_MS`  | Idle time before the black wake overlay      |
| `PUBLIC_ADVANCED_PROMPT_IDLE_MS` | Unlock prompt timeout; default 30 seconds    |
| `PUBLIC_ADVANCED_PANEL_IDLE_MS`  | Advanced panel timeout; default 5 minutes    |
| `PUBLIC_SHELLY_SCENE_ENDPOINT`   | Optional Shelly scene endpoint override      |
| `CONNECTIVITY_CHECK_URL`         | Optional connectivity probe override         |

The host service also supports `KENNEMER_REPO`, `KENNEMER_BRANCH`,
`KENNEMER_MAINTENANCE_HOST`, `KENNEMER_MAINTENANCE_PORT`,
`KENNEMER_UPDATE_SERVICE`, `KENNEMER_TOUCHSCREEN_VENDOR_ID`, and
`KENNEMER_TOUCHSCREEN_PRODUCT_ID`.

Never commit secrets, certificates, `app/.env`, `device-states.json`, or
`ips.json`.

## Development workflow

From `app/`:

```bash
npm ci
npm run dev
npm run check
npm run build
npm run lint
```

From the repository root:

```bash
docker compose build web
docker compose up -d web
docker compose ps
```

Use `npm run check` and `npm run build` after application changes. Existing
Svelte accessibility warnings may be present; do not silently introduce new
warnings or errors.

## Safety rules

- Never call `/actions`, `/triggers`, or a Shelly endpoint merely to test code.
  They can switch real building equipment.
- Use static validation, unit-level logic, or
  `SHELLY_SIMULATE_DEVICES=1` for non-production testing.
- Never put actual auth keys, tokens, device credentials, or certificates in
  commits or output.
- Preserve offline behavior: configured controls stay usable, status falls
  back safely, and connectivity remains visible.
- Preserve the first-touch wake guard on the idle overlay.
- Preserve confirmation for destructive or building-wide actions such as
  **ALLES UIT**.
- Do not treat a scene's successful HTTP response as proof of relay state.
- Do not reorder primary buttons by array position; use `pushNumber`.
- Do not edit generated directories: `app/node_modules`, `app/.svelte-kit`, or
  `app/build`.
- The worktree may contain maintainer changes. Inspect `git status` and do not
  revert unrelated work.

## Definition of done

For config-only changes:

1. Validate unique IDs and `pushNumber` values.
2. Confirm `on` and `off` scene IDs were not reversed.
3. Confirm status IDs and channel suffixes match the intended physical output.
4. Run `npm run check`.

For application changes:

1. Run `npm run check`.
2. Run `npm run build`.
3. Exercise UI logic without invoking real scene routes.
4. Verify offline, initial `Pingen...`, and idle wake behavior if affected.

For ODROID changes:

1. Read `odroid/AGENTS.md`.
2. Validate shell or Python syntax without starting an update.
3. Preserve systemd dependencies, health checks, rollback, and kiosk recovery.
4. Document any required reinstall or daemon reload.
