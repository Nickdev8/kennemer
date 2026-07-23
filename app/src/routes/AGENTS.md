# Route guide

These instructions cover Svelte pages and server endpoints below
`app/src/routes/`. Follow the parent guides too.

## Route map

| Route                        | Method   | Purpose                                  |
| ---------------------------- | -------- | ---------------------------------------- |
| `/`                          | GET      | Dashboard and initial page data          |
| `/actions`                   | POST     | Execute a configured device command      |
| `/triggers`                  | POST     | Execute a configured scene trigger       |
| `/api/connectivity`          | GET      | Probe Shelly Cloud reachability          |
| `/api/device-output`         | GET      | Read physical output status              |
| `/api/device-state`          | GET      | Read remembered action states            |
| `/api/device-state/callback` | GET/POST | Accept configured external state updates |
| `/api/device-state/stream`   | GET      | SSE stream of state changes              |
| `/api/hardware`              | GET      | Proxy touchscreen status from the host   |
| `/api/update`                | GET      | Read host update status                  |
| `/api/update`                | POST     | Request a host update                    |
| `/api/wattage/[room]`        | GET      | Read and aggregate room wattage          |
| `/api/wattage/cache`         | POST     | Refresh the Shelly device/IP cache       |

Read a route's implementation before changing its contract. The page has
polling and error handling coupled to these response shapes.

## Side-effect boundaries

`POST /actions`, `POST /triggers`, update POSTs, state callbacks, and wattage
cache POSTs mutate state or contact external systems. Never invoke them during
routine verification against a real deployment.

Action and trigger routes must resolve submitted identifiers against the
checked-in config. Do not accept client-provided endpoints, auth keys, or
arbitrary payloads.

Use JSON responses with meaningful HTTP status codes. Operational errors should
be understandable in the Dutch UI, but server logs may retain concise
technical context without secrets.

## Device output

`/api/device-output` accepts a configured status device identifier, splits an
optional channel suffix, and prefers a cached LAN IP. It falls back to Shelly
Cloud when needed. It also updates remembered state and sends SSE events when a
physical result is obtained.

Maintain these properties:

- short bounded network timeouts;
- no unbounded concurrent cloud burst;
- channel-aware status parsing;
- LAN failure can fall back to cloud;
- an offline result is distinguishable from a confirmed `off`.

## Maintenance proxies

`/api/update` and `/api/hardware` are server-side proxies to the ODROID host.
They require `KENNEMER_MAINTENANCE_TOKEN`. Keep that token private and keep the
host URL configurable.

The update UI polls GET status after POST starts the systemd job. A request
being accepted is not the same as deployment success; preserve the host's
running, success, failure, and rollback messages.

## Page changes

The main page is large because it coordinates kiosk-level behavior. Before
extracting logic, confirm that Svelte lifecycle cleanup remains correct:

- clear intervals and timeouts;
- close the SSE `EventSource`;
- avoid duplicate status loops;
- retain global pointer/keyboard idle tracking;
- retain the first-touch wake guard;
- do not close advanced controls while an update is running.

Do not perform broad visual redesigns without explicit user approval.
