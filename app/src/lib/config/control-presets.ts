import {
	sceneToggle as toggle,
	sceneButton as button,
	sceneDualButton as dual
} from './control-helpers';
import type { ControlPlacement, DashboardControl } from './schema';

type Defaults = { placement: ControlPlacement; tabId?: string; type?: string };
type Scoped<T> = Omit<T, 'placement'> & { placement?: ControlPlacement };
type Trigger = Extract<DashboardControl, { controlType: 'trigger' }>;
type Timed = Extract<DashboardControl, { controlType: 'timed-trigger' }>;
type Device = Extract<DashboardControl, { controlType: 'device' }>;

/** Defaults for one configuration file; each entry can override tab, placement and styling. */
export function controlHelpers(defaults: Defaults) {
	return {
		/** Aan/uit-scènes. Standaard groen/wit, met optioneel fysiek statusdeviceid. */
		sceneToggle(options: Scoped<Parameters<typeof toggle>[0]>): Device {
			return toggle({ ...defaults, ...options });
		},
		/** Eén scèneknop, zonder blijvende aan/uit-status. */
		sceneButton(options: Scoped<Parameters<typeof button>[0]>): Device {
			return button({ ...defaults, ...options });
		},
		/** Twee losse knoppen: on is Aan, off is Uit; standaard groen/wit. */
		sceneDualButton(options: Scoped<Parameters<typeof dual>[0]>): Device {
			return dual({ ...defaults, ...options });
		},
		/** Direct relais; directDeviceId bevat de Shelly-ID en eventueel het kanaal (_0, _1). */
		directDevice(
			options: Scoped<Omit<Device, 'controlType' | 'commands' | 'type' | 'buttonMode'>> & {
				directDeviceId: string;
				type?: string;
			}
		): Device {
			return {
				...defaults,
				type: 'Direct',
				statusdeviceid: options.directDeviceId,
				...options,
				controlType: 'device',
				buttonMode: 'toggle',
				commands: {
					on: { label: 'Aan', color: 'green', configured: true },
					off: { label: 'Uit', color: 'white', configured: true }
				}
			};
		},
		/** Eén Shelly-scène; kleur is optioneel. */
		sceneTrigger(options: Scoped<Omit<Trigger, 'controlType'>>): Trigger {
			return { ...defaults, ...options, controlType: 'trigger' };
		},
		/** Overwerktimer: standaard vier uur, oranje, op tab overwerktimer. */
		timedTrigger(
			options: Scoped<Omit<Timed, 'controlType' | 'buttonLabel' | 'activeDurationMs'>> & {
				buttonLabel?: string;
				activeDurationMs?: number;
			}
		): Timed {
			return {
				...defaults,
				tabId: 'overwerktimer',
				color: 'orange',
				buttonLabel: 'Start timer',
				activeDurationMs: 14_400_000,
				...options,
				controlType: 'timed-trigger'
			};
		}
	};
}
