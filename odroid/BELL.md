# Bell scheduler

`kennemer-bell.service` runs independently of Docker and the kiosk. It serves
an authenticated API on port 8788. Runtime data is SQLite at
`/var/lib/kennemer/bell/bell.sqlite3`. The service starts with a paused regular
roster. Duration and relay changes verify both outputs are off before applying
auto-off settings; they never ring the bells. Select one of four modes in the dashboard: Regulier, Verkort,
10-minutenbel, or Uit. Uit pauses automatic bells.

Regular and short rosters are copied from the school email in `todo.md`.
A double entry such as `08:10x2` sends a pulse for the configured bell duration,
waits until both relays are off, then waits the configured silent gap and sends
the second pulse. Saving a changed duration sets hardware auto-off on both relays to the same
duration after identity and off-state checks. A failed update restores the
previous timer settings and leaves the saved roster unchanged. Pulses still
require matching auto-off timers. The
ten-minute roster rings every ten minutes from 16:00 through
21:30 inclusive on the selected days. Weekends are available in the editor and
remain off unless selected.

The committed `bell-defaults.json` supplies the initial roster. The live roster
is saved separately in SQLite, so `update` compares its schedule fields with
the deployed defaults and prints a warning when they differ. Apply them
explicitly with `sudo update-bell-roster apply`; this prints the roster diff,
updates schedule settings, and preserves the current mode. It does not trigger
an immediate bell.

Use `sudo update-bell-roster push` to publish the saved server schedule to
`origin/main`. It prints the diff, creates a commit containing only
`odroid/bell-defaults.json`, and pushes from a temporary checkout based on the
latest remote main. It exports days, times, gap and duration; remote default
mode and relay IDs are preserved. The production checkout, staging area and
live mode stay intact. This does not deploy or ring the bells.

The ODROID needs configured Git `user.name` and `user.email`, plus existing
credentials with write access to origin. Push shares the deployment lock and
never force-pushes. If the remote rejects the push, the local commit is retained
under `refs/kennemer/bell-roster-pending/`; resolve access or remote changes and
run the command again. Offline coverage: `python3 odroid/test-bell-roster.py`
uses disposable repositories and a local bare remote.

Each occurrence is claimed in SQLite before contacting relays. A restart,
failed response, or lost response cannot repeat that occurrence. Missed events
are skipped. The host waits for `timedatectl` synchronization; a wall-clock
jump suppresses the current 31-second bell window. Time uses
`Europe/Amsterdam`, with one ledger key per local date, profile, and time.
A repeated DST clock hour cannot duplicate a bell. An HTTP response alone
never proves that the physical output changed; each relay result records
observed on/off state or a failure. No automatic retry is attempted.

## API and demo

All requests require `x-kennemer-maintenance-token` matching the token in
`app/.env`. The app proxies through `/api/bells/{operation}`. Writes require
`KENNEMER_CONFIG_EDIT_PIN` in the browser request, checked by the app server.

- `GET /status` gives the next bell, configured bell duration, clock state, relay
  readiness, latest outcome, and scheduler state.
- `GET /config` returns `{revision, config}`.
- `POST /config` accepts `{revision, config}`. A stale revision returns 409.
- `POST /pause`, `/resume`, `/restore` accept `{revision}`. Restore applies the
  previous saved roster while preserving the current mode. Only an explicit
  mode save changes the active profile or pauses the roster.
- `POST /demo` accepts `{request_id, count: 1|2}` and returns 202 immediately.
  Poll `/status` for the outcome. Reusing an ID does not ring again.

`npm run dev` and `npm run dev:live` show the four roster choices and manual
bell buttons as a disabled local preview. The bell service runs only on the
ODROID after deployment; local development cannot ring the bells.

## ODROID installation

1. Deploy the reviewed checkout through the normal update path. The link
   installer places `kennemer-bell.service` in `/etc/systemd/system`, but does
   not enable or start it. The app container needs
   `KENNEMER_BELL_URL=http://host.docker.internal:8788` in `app/.env`.
2. Create a dedicated account and durable directory once:

   ```sh
   sudo useradd --system --home /var/lib/kennemer/bell --shell /usr/sbin/nologin kennemer
   sudo install -d -o kennemer -g kennemer -m 0700 /var/lib/kennemer/bell
   sudo install -d -o root -g root -m 0755 /etc/kennemer
   ```

   If the account or directory already exists, check ownership rather than
   recreating it. The service reads the existing maintenance token from
   `/opt/kennemer/app/.env` and the mode from `/etc/kennemer/bell.env`.
3. For a simulated host run, put `KENNEMER_BELL_SIMULATION=1` in
   `/etc/kennemer/bell.env` (root owned, mode 0600). Then run:

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now kennemer-bell.service
   systemctl status kennemer-bell.service
   ```

4. Select each of the four modes in **Roosters beheren** with the PIN and test
   both demo counts. Confirm the service clock, next event, and two relay
   outcomes. Test a restart and a duplicate demo ID against the ledger.
5. For live commissioning, set only `KENNEMER_BELL_LIVE=1` in
   `/etc/kennemer/bell.env`, restart the unit, and confirm the two fixed devices
   by read-only `/status`. Keep the roster paused. Check the observed physical
   outputs and manually configure both devices with `initial_state: off`,
   `auto_off: true`, and `auto_off_delay` equal to the initial bell duration.
   The service rejects live pulses until identity and configuration match. Use
   **Bel nu 1×**, then **Bel nu 2×** with the site operator present. Confirm that
   both relays turn off after each pulse and that the ledger reports both
   outcomes. Resume the roster only after both tests have been accepted.

The default relay IDs are `a8032abc4264` and `08b61fd8993c`. Their IDs are editable under **Bediening beheren**; LAN
addresses are resolved on every request from the shared device cache at
`/opt/kennemer/runtime/ips.json` (`/runtime/ips.json` in Docker); no IP addresses
are stored in the roster. `KENNEMER_BELL_IP_CACHE` overrides the host cache path.
Existing cache data is copied into this shared location during update. Identities are
verified before saving. Relay selections persist in SQLite and roster-default
updates preserve them. The service verifies Shelly Plus 1 identity and safety
configuration before each pulse. It sends `Switch.Set` with `on:true` and
`toggle_after` set to the configured duration concurrently to both. Any partial failure stops a second
pulse; the ledger retains both relay outcomes. Network and relay errors do
not cause a retry.

Run offline checks with `PYTHONDONTWRITEBYTECODE=1 python3 -W error
odroid/test-bell-scheduler.py`; never use a live demo call for a software test.

## Commissioning record (12 October 2026)

On `dashboard` via `kennemer-cloudflare`, `kennemer-bell.service` is enabled and
active. Both fixed Shelly Plus 1 IDs matched, with `initial_state: off`,
`auto_off: true`, and `auto_off_delay: 1`; both outputs read off. One single
and one double manual demo finished with success for both relays on every pulse.
The automatic roster remains paused (`Uit`). The dashboard status and config
proxy endpoints returned HTTP 200.
