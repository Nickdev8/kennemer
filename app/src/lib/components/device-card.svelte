<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';

	const baseCardClass =
		'flex h-full max-h-[18rem] min-h-[12rem] flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 shadow-sm transition duration-300 ease-out';
	const cardNeutralClass = 'border-slate-200 bg-white/95';
	const cardOnClass =
		'border-emerald-300/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 shadow-lg shadow-emerald-100/60 ring-2 ring-emerald-200';
	const cardOffClass = 'border-rose-300/80 bg-rose-50/90 shadow-inner ring-1 ring-rose-200';
	const cardCustomClass = 'shadow-lg';

	const baseButtonClass =
		'relative flex w-full items-center justify-center rounded-xl px-5 py-6 text-xl font-semibold transition duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 max-h-32 min-h-[4rem]';
	const buttonOnIdleClass =
		'border border-emerald-500 bg-white text-slate-700 enabled:hover:bg-emerald-200';
	const buttonOffIdleClass =
		'border border-rose-500 bg-white text-slate-700 enabled:hover:bg-rose-200';
	const buttonOnProminentClass =
		'border border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200/70 enabled:hover:bg-emerald-600';
	const buttonOffProminentClass =
		'border border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-200/70 enabled:hover:bg-rose-600';
	const buttonNeutralClass =
		'border border-slate-300 bg-white text-slate-700 enabled:hover:bg-slate-100';
	const buttonCustomClass =
		'border text-white shadow-lg shadow-slate-200/70 enabled:hover:brightness-95';

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
let cardStyle: string | undefined;

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
		cardStyle = undefined;

		const currentCommand = optimisticStatus ? device.commands[optimisticStatus] : null;
		const hexColor = currentCommand ? normalizeHexColor(currentCommand.type ?? '') : null;
		const borderHex =
			currentCommand && currentCommand.typeBorder
				? normalizeHexColor(currentCommand.typeBorder)
				: hexColor;

		if (hexColor) {
			const borderColor = borderHex ?? hexColor;
			const background = lightenHex(hexColor, 0.9);
			cardStyle = [`border-color:${borderColor}`, `background:${background}`].join(';');
			return `${baseCardClass} ${cardCustomClass}`;
		}

		if (optimisticStatus === 'on') return `${baseCardClass} ${cardOnClass}`;
		if (optimisticStatus === 'off') return `${baseCardClass} ${cardOffClass}`;
		return `${baseCardClass} ${cardNeutralClass}`;
	})();

	type CommandVisualState = {
		key: string;
		className: string;
		style?: string;
		ariaPressed: boolean;
	};

	let commandVisualStates: Partial<Record<DeviceCommandKey, CommandVisualState>> = {};

	const hexColorRegex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

	function normalizeHexColor(color: string): string | null {
		const trimmed = color.trim();
		if (!hexColorRegex.test(trimmed)) return null;
		if (trimmed.length === 4) {
			// Expand #abc to #aabbcc
			const [, r, g, b] = trimmed.split('');
			return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
		}
		return trimmed.toLowerCase();
	}

function getTextColor(hexColor: string): string {
	// Compute perceived brightness to pick a readable text color
	const r = parseInt(hexColor.slice(1, 3), 16);
	const g = parseInt(hexColor.slice(3, 5), 16);
	const b = parseInt(hexColor.slice(5, 7), 16);
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness > 150 ? '#0f172a' : '#ffffff';
}

	function lightenHex(hexColor: string, weight = 0.9): string {
		const r = parseInt(hexColor.slice(1, 3), 16);
		const g = parseInt(hexColor.slice(3, 5), 16);
		const b = parseInt(hexColor.slice(5, 7), 16);
		const mix = (channel: number) =>
			Math.round(channel + (255 - channel) * weight)
				.toString(16)
				.padStart(2, '0');
		return `#${mix(r)}${mix(g)}${mix(b)}`;
	}

	type ButtonVisual = {
		className: string;
		style?: string;
	};

	function computeButtonClass(command: DeviceCommandKey, key: string): ButtonVisual {
		const config = device.commands[command];
		const typeValue = config?.type;
		const typeString =
			typeof typeValue === 'string'
				? typeValue
				: typeValue === undefined
					? ''
					: String(typeValue);
		const rawType = typeString.trim().toLowerCase();
		const hexColor = normalizeHexColor(typeString);
		const borderHex = normalizeHexColor(config?.typeBorder ?? '') ?? hexColor;

		const classes = [baseButtonClass];
		let style: string | undefined;

		if (hexColor) {
			const textColor = getTextColor(hexColor);
			const borderColor = borderHex ?? hexColor;
			classes.push(buttonCustomClass);
			style = [
				`--btn-color:${hexColor}`,
				`--btn-text:${textColor}`,
				`--btn-border:${borderColor}`,
				'background:var(--btn-color)',
				'border-color:var(--btn-border)',
				'color:var(--btn-text)',
				'box-shadow:0 0 0 2px var(--btn-border)'
			].join(';');
		} else if (rawType === 'none' || rawType === 'neutral') {
			classes.push(buttonNeutralClass);
		} else if (rawType === 'off') {
			classes.push(optimisticStatus === 'off' ? buttonOffProminentClass : buttonOffIdleClass);
		} else if (rawType === 'on') {
			classes.push(optimisticStatus === 'on' ? buttonOnProminentClass : buttonOnIdleClass);
		} else if (command === 'off') {
			classes.push(optimisticStatus === 'off' ? buttonOffProminentClass : buttonOffIdleClass);
		} else {
			classes.push(optimisticStatus === 'on' ? buttonOnProminentClass : buttonOnIdleClass);
		}

		if (loadingCommandKey === key) {
			classes.push('ring-2 ring-blue-200 ring-offset-2 ring-offset-white');
		}

		return {
			className: classes.join(' '),
			style
		};
	}

	$: commandVisualStates = commandOrder.reduce(
		(acc, command) => {
			if (!device.commands[command]) return acc;
			const key = commandKey(device.id, command);
			const visual = computeButtonClass(command, key);
			acc[command] = {
				key,
				className: visual.className,
				style: visual.style,
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

<section class={cardClassName} style={cardStyle}>
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

	<div class="grid flex-1 grid-cols-2 gap-4">
		{#each commandOrder as cmd}
			{#if device.commands[cmd]}
				{@const state = commandVisualStates[cmd]}
				{#if state}
					<button
						type="button"
						class={state.className}
						style={state.style}
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
