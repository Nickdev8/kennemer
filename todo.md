# Kennemer backlog

Updated: 12 October 2026. No Git/GitHub/CI work without explicit request.

## Done

- [x] Short typed configs, shared registry, automatic validation; controls sorted 1–9.
- [x] Isolated persistent `dev`, explicit `dev:live`; Docker stays live.
- [x] Dashboard components, shared polling/state logic, offline fallback and wake guard.
- [x] Home/Apparaten tabs; movable blue navigation above advanced controls.
- [x] Direct LAN control: Color spare 051026, `90706948e37c`, `10.10.80.169`.
- [x] Header numbers down columns: `1 4 7 / 2 5 8 / 3 6 9`; original locations retained.
- [x] Responsive inline editor: labels, colors, tabs, positions, timers, scene/status IDs, Ja/Nee.
- [x] PIN saves, import/export, reset/restore, migration, backups and conflict handling.
- [x] Debug popup: version/commit hashes, connection/device status; read-only remote checks.
- [x] Consistent button colors, Dutch copy and advanced-panel layout.
- [x] Three mutually exclusive bell-roster buttons; frontend selection only.
- [x] Local checks/build, logic/browser tests and host diagnostics tests pass.

## Bell — backend waiting on explicit request

Confirmed Shelly Plus 1 relays; pulse duration **1 second**, both triggered together:

| Name | Device ID | IP |
| --- | --- | --- |
| Bel school 1 | `a8032abc4264` | `10.10.80.162` |
| Bel school 2 | `08b61fd8993c` | `10.10.80.161` |

- [ ] Obtain times/weekdays, holidays and meaning of `10-minutenbel`.
- [ ] Build ODROID scheduler independent of browser/container; one active roster.
- [ ] Durable schedules/event ledger, atomic edits, restart deduplication and outcome logs.
- [ ] Amsterdam timezone, synchronized clock/DST handling; skip missed bells, no blind retries.
- [ ] Concurrent identity-checked relay pulses with device-side `toggle_after: 1`.
- [ ] Add Roosters beheren: times, exceptions, PIN save, pause/resume, import/export/restore.
- [ ] Show next bell, service/clock health and both relay outcomes.
- [ ] Offline fault/reboot tests, installation docs and deliberate live commissioning.

No bell backend or live ringing implemented. Both relays previously had auto-off
disabled; review startup behavior before activation. HTTP cannot guarantee
exactly-once or electrically simultaneous ringing.

## Later

- [ ] Shelly group control: confirm API/IDs.
- [ ] Investigate old update CLI issue if still reproducible; preserve rollback.
- [ ] Footer/arrow navigation, RGB controls, hardware enrollment, longer restore history.

## Checks / deployment

From `app/`: `validate:config`, `check`, `build`, `test`, `test:ui` via `npm run`.
Routine tests stay mocked. Backend bell work remains on hold.
Host diagnostics needs the updated `kennemer-maintenance-api.service` after deployment.
