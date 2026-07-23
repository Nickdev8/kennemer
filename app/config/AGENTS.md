# Control configuration guide

This directory is the maintainer-facing source for dashboard controls. Follow
`app/AGENTS.md` and the root `AGENTS.md` as well.

## Files

- `devices.ts`: the nine primary dashboard positions.
- `triggers.ts`: the red **ALLES UIT** scene.
- `advanced.ts`: devices and triggers shown after advanced unlock.

Types come from `src/lib/config/schema.ts`. Use those types instead of creating
parallel config shapes.

## Device contract

A `ShellyDevice` needs a stable unique `id`, a Dutch `label`, a descriptive
`type`, a `buttonMode`, and a `commands` object.

Supported modes:

- `toggle`: one control that switches between `on` and `off`.
- `dual`: distinct on and off controls.
- `single`: one command, normally `on`.

Set `stateless: true` for a trigger-like device whose persistent state cannot
be inferred from the action. Do not attach a fake state to timed or momentary
scenes.

`activeDurationMs` gives a stateless single-action button a temporary active
state and server-side repeat lock. Use it only when the physical action has a
known cooldown or run time.

For the main grid, `pushNumber` is the authoritative layout position:

```text
1 2 3
4 5 6
7 8 9
```

Do not rely on the array order. Use every primary number exactly once.

## Commands and scenes

A command can define `cloud`, `lan`, or both. A target includes:

- `endpoint`
- HTTP `method`
- optional `payload`
- optional `headers`
- `requiresAuthKey` when Shelly Cloud authentication is required

Shelly scene commands use the endpoint in `PUBLIC_SHELLY_SCENE_ENDPOINT` or
the current default scene endpoint. Their JSON payload is `{ id: 'SCENE_ID' }`.

Mapping is strict:

- `commands.on` has label `Aan` and the scene that turns equipment on.
- `commands.off` has label `Uit` and the scene that turns equipment off.

Never swap these to compensate for UI styling. Fix styling in the component.

An absent target or empty scene ID is intentionally not configured. Validation
must leave that action disabled. Never invent an ID or copy a neighboring
scene as a placeholder.

## Status devices

`statusdeviceid` reads a physical Shelly output independently from the scene
that was triggered. Accepted IDs are a 12-character hexadecimal device ID with
an optional numeric channel suffix:

```text
2043a80ac3e4
2043a80ac3e4_1
```

The suffix is an output channel, not part of the base Shelly device ID. Verify
both device and channel when changing the grid; several two-channel Shellies
serve different buttons.

A missing status ID means the UI cannot read live state. That alone must not
make a valid scene unclickable.

## Current special controls

`Screen lokalen` is position 5, uses `buttonMode: 'single'`, is stateless, and
shows the `arrow-up` icon with label `Screens omhoog`. Its
`activeDurationMs: 60_000` keeps the button green and prevents the scene from
running again for one minute.

`energyDevicesTrigger` is the **ALLES UIT** scene. It is presented under the
wattage section and requires a Dutch authorization confirmation in the UI.

The two advanced controls are currently harmless placeholders. Keep both
payloads empty until the maintainer provides explicit IDs.

## Validation checklist

Before finishing a config edit:

1. Compare every supplied scene ID against the intended `Aan` or `Uit` action.
2. Check unique `id` and `pushNumber` values.
3. Check every `statusdeviceid` and channel suffix.
4. Ensure stateless controls do not display persistent state.
5. Run `npm run check` from `app/`.
6. Do not make a live request to prove that the scene works.
