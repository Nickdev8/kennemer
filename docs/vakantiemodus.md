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

The working Wi-Fi path was verified through read-only SSH requests. No application
LAN status feature or replacement scene execution was installed.

The independently commissioned bell relays are `a8032abc4264` and `08b61fd8993c`.
The first was separately identity-checked over LAN and read off; the second was
unreachable from the workstation. The vacation scenes do not pause or resume the
ODROID bell scheduler. The transformer name alone does not establish the wiring
or prove whether a particular bell can sound.

## Limits and deferred work

At discovery, the cloud flags were mixed: `gang aan` enabled, summer-screen
disabled, alarm enabled. The transformer reading alone cannot prove a complete
vacation mode: cloud automation flags and queued delays are separate facts.

The user deferred vacation implementation. Existing mode rendering, remembered
action behavior and configured Shelly Cloud scene execution remain unchanged.
No checklist API, aggregate mode reader, LAN replacement action or new schedule
was added. The findings above are investigation evidence only.

Sources: [Shelly identity/status](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Shelly/),
[Switch status](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Switch/),
plus the credential-redacted live scene and inventory inspection described above.
