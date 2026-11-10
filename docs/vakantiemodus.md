# Vakantiemodus: verified behavior

Read-only discovery on 10 November 2026 inspected the live Shelly scene definitions,
account inventory, and device status. Production overrides were read through the
explicitly authorized `kennemer-local` SSH session; no override exists for this
control's on/off/status slots. No scene, output, schedule or host service was changed.

| Command | Verified effects |
| --- | --- |
| Begin vakantie (`1789564319962`) | Turns transformer `ece334f7b214`, channel 2, **off**; disables `gang aan` (`1727329580882`) and `Scr. HFD dicht zomer` (`1782213221849`); after **180 minutes**, disables `Alles uit Alarm` (`1730105330475`). |
| Einde vakantie (`1789565464427`) | Turns that transformer channel **on** and immediately enables all three cloud scenes. |

The cloud action reference `dev:260460590379540:r3` maps to the account entry
`ece334f7b214_2`, named **3) Bel trafo** (channel 2). Enabling/disabling the three
other scenes changes their automation flags; it does not run their actions.

The affected scene definitions currently contain:

- **gang aan:** delayed on commands for groups 2, 10, 7 and 8.
- **Scr. HFD dicht zomer:** a scheduled close command for screen group 11.
- **Alles uit Alarm:** alarm-input/manual conditions; light-off and delayed
  screen-open actions. These remain cloud-managed, including their delays.

## LAN findings

The Shelly Pro 3 (`SPSW-003XE16EU`, generation 2) has both Ethernet and Wi-Fi.
Its inventory/cache address, `10.50.0.2`, was unreachable from the ODROID. The
cloud status reported Wi-Fi address `10.10.80.69`; read-only requests from the
ODROID verified MAC `ECE334F7B214`, model, generation, authentication disabled,
and channel 2 physically **on** at observation time. This Wi-Fi address is a
snapshot, not a fixed application target.

The working Wi-Fi path was verified through read-only SSH during the earlier
investigation. It was not switched or reconfigured. The current implementation
was verified with mocked transport only; it has not been deployed.

The independently commissioned bell relays are `a8032abc4264` and `08b61fd8993c`.
The first was separately identity-checked over LAN and read off; the second was
unreachable from the workstation. The vacation scenes do not pause or resume the
ODROID bell scheduler. The transformer name alone does not establish the wiring
or prove whether a particular bell can sound.

## Current implementation and limits

`GET /api/modes/vacation` reads the registered control's effective Begin/Einde
scene IDs, including runtime configuration. Its checklist follows those actual
scene definitions, rather than a hardcoded three-rule list. Fixed output on/off
and cloud scene enabled/disabled actions are supported; unsupported, conflicting,
missing or incomplete actions make the aggregate **Onbekend**.

A complete observation matching Begin is **Actief**; one matching Einde is
**Niet actief**. Fully observed but mismatching combinations are **Gedeeltelijk**.
Physical outputs and enabled flags display their actual value: green for on or
enabled, red for off or disabled, grey for unknown. Action memory and successful
command HTTP responses never supply checklist state.

The server prefers identity-checked LAN reads using cached/discovered device
interfaces. If LAN is unavailable, it may use a fresh online cloud status report,
explicitly marked **Cloud**. If neither provides a valid observation, the value
remains unknown. Credentials, addresses and raw cloud metadata stay server-side.
Definitions and inventory are cached for at most five minutes; status snapshots
for thirty seconds. In-flight reads coalesce, cloud reads are serialized, and
bounded explicit refreshes respect a minimum interval.

The card retains **Begin vakantie** and **Einde vakantie** as two explicit actions
through the existing registered control ID and validated action route. Offline
status does not disable configured scene buttons. It creates no replacement
holiday actions, scene-enable calls, timer jobs or bell-scheduler changes. A
configured delay is displayed as a duration, never as an invented live countdown.
The current checklist cannot inspect already queued cloud delay jobs.

All verification for this implementation used unit fixtures or a local mocked
browser with external requests blocked. No live test, SSH, scene execution,
setting change or deployment was performed for the implementation.

Sources for the earlier investigation:
[Shelly identity/status](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Shelly/),
[Switch status](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Switch/),
plus the credential-redacted scene and inventory inspection described above.
