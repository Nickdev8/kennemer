<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';

const baseCardClass =
	'flex h-full flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 shadow-sm transition duration-300 ease-out';
	const cardNeutralClass = 'border-slate-200 bg-white/95';
	const cardOnClass =
		'border-emerald-300/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 shadow-lg shadow-emerald-100/60 ring-2 ring-emerald-200';
	const cardOffClass = 'border-rose-300/80 bg-rose-50/90 shadow-inner ring-1 ring-rose-200';

const baseButtonClass =
	'relative flex h-full w-full items-center justify-center rounded-xl px-5 py-6 text-xl font-semibold transition duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60';
const buttonOnIdleClass =
	'border border-emerald-500 bg-white text-slate-700 enabled:hover:bg-emerald-200';
const buttonOffIdleClass =
	'border border-rose-500 bg-white text-slate-700 enabled:hover:bg-rose-200';
const buttonOnProminentClass =
	'border border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200/70 enabled:hover:bg-emerald-600';
const buttonOffProminentClass =
	'border border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-200/70 enabled:hover:bg-rose-600';

export let device: ShellyDevice;
export let commandOrder: DeviceCommandKey[];
export let commandKey: (deviceId: string, command: DeviceCommandKey) => string;
export let commandLabel: (device: ShellyDevice, command: DeviceCommandKey) => string;
export let loadingCommandKey: string | null;
export let initialStatus: DeviceCommandKey | null = null;
export let showGroup = false;

	const dispatch = createEventDispatcher<{
		command: { deviceId: string; command: DeviceCommandKey };
	}>();

let optimisticStatus: DeviceCommandKey | null = null;
let previousInitialStatus: DeviceCommandKey | null | undefined = undefined;

const currentOptimisticKey = () =>
	optimisticStatus ? commandKey(device.id, optimisticStatus) : null;

	$: {
		if (initialStatus !== undefined && initialStatus !== previousInitialStatus) {
			previousInitialStatus = initialStatus;
			const deviceLoading =
				typeof loadingCommandKey === 'string' && loadingCommandKey.startsWith(`${device.id}:`);
			if (!deviceLoading) {
				optimisticStatus = initialStatus ?? null;
			}
		}
	}

	$: cardClassName = (() => {
		if (optimisticStatus === 'on') return `${baseCardClass} ${cardOnClass}`;
		if (optimisticStatus === 'off') return `${baseCardClass} ${cardOffClass}`;
		return `${baseCardClass} ${cardNeutralClass}`;
	})();

	function computeButtonClass(command: DeviceCommandKey, key: string) {
		const classes = [baseButtonClass];

		if (command === 'on') {
			classes.push(optimisticStatus === 'on' ? buttonOnProminentClass : buttonOnIdleClass);
		} else {
			classes.push(optimisticStatus === 'off' ? buttonOffProminentClass : buttonOffIdleClass);
		}

		if (loadingCommandKey === key) {
			classes.push('ring-2 ring-blue-200 ring-offset-2 ring-offset-white');
		}

		return classes.join(' ');
	}

	type CommandVisualState = {
		key: string;
		className: string;
		ariaPressed: boolean;
	};

	let commandVisualStates: Partial<Record<DeviceCommandKey, CommandVisualState>> = {};

	$: commandVisualStates = commandOrder.reduce(
		(acc, command) => {
			if (!device.commands[command]) return acc;
			const key = commandKey(device.id, command);
			acc[command] = {
				key,
				className: computeButtonClass(command, key),
				ariaPressed: optimisticStatus === command
			};
			return acc;
		},
		{} as Partial<Record<DeviceCommandKey, CommandVisualState>>
	);

	function handleCommand(command: DeviceCommandKey) {
		const key = commandKey(device.id, command);
		optimisticStatus = command;
		dispatch('command', { deviceId: device.id, command });
	}

</script>

<section class={cardClassName}>
	<div class="flex items-center justify-between gap-4">
		<div class="min-w-0">
			<h3 class="truncate text-lg font-semibold tracking-tight text-slate-800 sm:text-xl">
				{device.label}
			</h3>
			{#if showGroup}
				<p class="text-xs uppercase tracking-wide text-slate-400">{device.group}</p>
			{/if}
		</div>
	</div>

	<div class="grid flex-1 grid-cols-2 gap-4 auto-rows-fr">
		{#each commandOrder as cmd}
			{#if device.commands[cmd]}
				{@const state = commandVisualStates[cmd]}
				{#if state}
					<button
						type="button"
						class={state.className}
						aria-pressed={state.ariaPressed}
						on:click={() => handleCommand(cmd)}
					>
						<span class="pointer-events-none text-center">{commandLabel(device, cmd)}</span>
						{#if loadingCommandKey === state.key}
							<span class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/70 text-sm font-semibold uppercase tracking-wide text-white">
								Bezig…
							</span>
						{/if}
					</button>
				{/if}
			{/if}
		{/each}
	</div>
</section>
