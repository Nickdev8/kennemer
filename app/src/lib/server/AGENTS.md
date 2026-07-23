# Server library guide

This directory contains trusted server-only infrastructure. Nothing here may be
imported into browser bundles.

## Shelly transport

`shelly-http.ts` validates targets and sends configured commands.

- Cloud requests add the Shelly auth key only when required.
- Scene API calls are cloud calls even when `USE_LAN_DEVICES=1`.
- LAN is preferred only when a command supplies a valid LAN target.
- Rate-limited cloud calls use bounded retry behavior.
- Simulation mode must avoid real device calls.

Do not log auth keys, full secret-bearing headers, or credentials embedded in
URLs. Keep timeouts and retry counts bounded so the kiosk cannot hang on a
failed device.

`shelly-rpc.ts` handles Gen2 RPC requests used by status and wattage code.
Shelly generations return different response shapes; preserve both supported
parsers when making changes.

## Remembered state

`device-state-store.ts` persists a small device-to-state map. The default path
is relative to the application working directory and can be overridden with
`DEVICE_STATE_PATH`.

Writes use a temporary file followed by rename. Preserve atomic replacement so
a power loss cannot leave half-written JSON. Reads must tolerate a missing file
and recover safely from malformed runtime data.

`device-state-events.ts` is the in-process publish/subscribe source for the SSE
route. Event state supplements polling; it does not replace physical status
reads and does not need to survive a process restart.

## IP cache

`ips.json` maps Shelly device IDs to recently discovered LAN addresses. It is
runtime data, not configuration. Never hardcode a changing DHCP address in
application logic when the cache can resolve it.

Code using cached addresses must still handle stale IPs, short timeouts, and
cloud fallback. Cache refresh must not make normal page rendering wait for
every device.

## Testing rules

- Prefer pure parsing tests with representative Shelly response objects.
- Enable `SHELLY_SIMULATE_DEVICES` for command-path tests.
- Do not test with production scene IDs by issuing HTTP calls.
- Exercise missing credentials, timeout, rate-limit, malformed JSON, offline,
  multi-channel, and fallback behavior when relevant.
