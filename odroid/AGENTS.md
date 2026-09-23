# ODROID host guide

This directory owns the host operating system integration. Read the root
`AGENTS.md` first. Changes here can interrupt the physical kiosk, so preserve
recovery and rollback behavior.

## Production layout

The checkout is expected at `/opt/kennemer`. `install-maintenance-links`
creates stable commands in `/usr/local/sbin` that point back to scripts in this
checkout.

Main operator commands:

- `update`: deploy the latest `origin/main`.
- `restart`: restart the kiosk display.
- `screen start|stop|restart|status`: control or inspect the kiosk stack.

Do not copy diverging script versions into `/usr/local/sbin`; update the
version-controlled source and refresh links.

## Services

| Unit                           | Responsibility                             |
| ------------------------------ | ------------------------------------------ |
| `kennemer-app.service`         | Supervises the Docker application          |
| `odroid-kiosk.service`         | Runs the physical Xorg/Openbox/Brave kiosk |
| `kennemer-maintenance.service` | Authenticated host maintenance API         |
| `kennemer-update.service`      | One-shot safe deployment                   |
| `kennemer-update.timer`        | Scheduled update check                     |
| `kennemer-reverse-ssh.service` | Remote maintenance tunnel                  |

After changing a unit:

```bash
systemctl daemon-reload
systemctl restart NAME.service
systemctl status NAME.service
```

Do not restart production services merely to validate a documentation or
syntax-only change.

## Kiosk startup

`screen` prepares Xorg on display `:0`, starts the kiosk session, and watches
application health. `kiosk-session` starts Openbox and Brave in kiosk mode.
The display is kept physically awake with `xset`; visual idle dimming belongs
to the webapp.

The watchdog restarts the browser stack after repeated application health
failures. Preserve bounded restart behavior to avoid a tight crash loop.

A black screen during a restart can be normal while Xorg and Brave initialize.
For diagnosis use:

```bash
screen status
systemctl status odroid-kiosk.service
journalctl -u odroid-kiosk.service -n 100
docker compose -f /opt/kennemer/docker-compose.yml ps
```

## Touchscreen detection

The maintenance API checks USB devices for the configured vendor and product
IDs. Defaults are vendor `2a94` and product `1804`. The webapp turns a missing
match into a touchscreen warning.

HDMI carries video; USB carries touch data and may also carry power. A
power-only USB cable can display an image while making touch impossible.

Environment overrides:

- `KENNEMER_TOUCHSCREEN_VENDOR_ID`
- `KENNEMER_TOUCHSCREEN_PRODUCT_ID`

Detection is diagnostic only. Do not make a missing touchscreen stop the
webapp or the kiosk.

## Maintenance API

`maintenance-api` is a small Python HTTP server, normally bound to port 8787.
It supports authenticated:

- `GET /status`
- `POST /update`
- `GET /hardware`

The `x-kennemer-maintenance-token` header must match
`KENNEMER_MAINTENANCE_TOKEN`. Keep the service unreachable from untrusted
networks; the token is an additional control, not a reason to expose the port.

The update endpoint starts a systemd unit and returns quickly. Status polling
reports the actual result. Do not run the update script directly inside the
HTTP request.

## Safe deployment

`update` is intentionally defensive. Preserve:

- repository and branch validation;
- Git fetch and fast-forward-only policy;
- free-space check;
- candidate worktree outside the production checkout;
- candidate Docker build;
- previous-image rollback tag;
- application readiness and health checks;
- rollback when the new container is unhealthy;
- maintenance-link refresh;
- final kiosk restart.

The script may use destructive Git operations only against its validated
production checkout or disposable candidate worktree. Never generalize those
paths or use unresolved broad environment variables.

The web image runs on the current Node.js 24 LTS line. Its default self-signed
HTTPS certificate is generated at container start and renewed when it has less
than 30 days remaining. Mounted certificates are left unchanged.

The scheduled timer runs around 03:00 with a randomized delay. A manual update
and a timer update must not be able to corrupt each other; preserve systemd's
single-unit execution semantics.

## Validation

Use non-mutating checks where possible:

```bash
bash -n odroid/update
bash -n odroid/screen
bash -n odroid/kiosk-session
python3 -m py_compile odroid/maintenance-api
systemd-analyze verify odroid/*.service odroid/*.timer
```

`py_compile` creates a cache directory; remove only that generated directory
after checking. `systemd-analyze verify` may report dependencies supplied by
the target host; distinguish those from syntax errors.

Never invoke `odroid/update` as a test: it fetches, builds, replaces the live
checkout, and restarts the kiosk.
