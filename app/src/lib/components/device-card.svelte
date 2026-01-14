<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';

	const baseCardClass =
		'flex h-full max-h-[18rem] min-h-[12rem] flex-col gap-3 rounded-3xl border-l-8 border-slate-200 bg-white px-5 py-5 shadow-sm transition duration-200 ease-out';
	const cardNeutralClass = 'border-slate-200 border-l-slate-200 bg-white';
	const cardOnClass =
		'border-emerald-300 bg-emerald-50 shadow-lg shadow-emerald-100/70 ring-2 ring-emerald-200';
	const cardOffClass = 'border-slate-200 bg-slate-50 shadow-inner';
	const cardCustomClass = 'shadow-lg';

	const baseButtonClass =
		'relative flex w-full items-center justify-center rounded-2xl px-5 py-6 text-xl font-semibold transition duration-150 ease-out active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 max-h-32 min-h-[4rem]';
	const buttonOnIdleClass =
		'border border-emerald-500 bg-white text-slate-700';
	const buttonOffIdleClass =
		'border border-rose-500 bg-white text-slate-700';
	const buttonOnProminentClass =
		'border border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200/70';
	const buttonOffProminentClass =
		'border border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-200/70';
	const buttonNeutralClass =
		'border border-slate-300 bg-white text-slate-700';
	const buttonCustomClass =
		'border text-white shadow-lg shadow-slate-200/70';

	export let device: ShellyDevice;
	export let commandOrder: DeviceCommandKey[];
	export let commandKey: (deviceId: string, command: DeviceCommandKey) => string;
	export let commandLabel: (device: ShellyDevice, command: DeviceCommandKey) => string;
	export let loadingCommandKey: string | null;
	export let initialStatus: DeviceCommandKey | null = null;
	export let showGroup = false;
	export let resolveToggleCommand: (status: DeviceCommandKey | null) => DeviceCommandKey = (
		status
	) => (status === 'on' ? 'off' : 'on');

	const dispatch = createEventDispatcher<{
		command: { deviceId: string; command: DeviceCommandKey };
	}>();

	let optimisticStatus: DeviceCommandKey | null = null;
	let previousInitialStatus: DeviceCommandKey | null | undefined = undefined;
	let cardStyle: string | undefined;
	let deviceLoading = false;
	let isToggle = false;
	let commandGridClass = 'grid-cols-2';
	let statusLabel = 'Uit';
	let statusDotClass = 'bg-slate-400';
	let statusTextClass = 'text-slate-600';

	const currentOptimisticKey = () =>
		optimisticStatus ? commandKey(device.id, optimisticStatus) : null;

	$: deviceLoading =
		typeof loadingCommandKey === 'string' && loadingCommandKey.startsWith(`${device.id}:`);

	$: isToggle = device.buttonMode === 'toggle';

	$: commandGridClass = isToggle ? 'grid-cols-1' : 'grid-cols-2';

	$: {
		if (optimisticStatus === 'on') {
			statusLabel = 'Aan';
			statusDotClass = 'bg-emerald-500';
			statusTextClass = 'text-emerald-700';
		} else {
			statusLabel = 'Uit';
			statusDotClass = 'bg-slate-400';
			statusTextClass = 'text-slate-600';
		}
	}

	$: {
		if (initialStatus !== undefined && initialStatus !== previousInitialStatus) {
			previousInitialStatus = initialStatus;
			if (!deviceLoading) {
				optimisticStatus = initialStatus ?? null;
			}
		}
	}

	$: cardClassName = (() => {
		cardStyle = undefined;

		if (optimisticStatus === 'on') {
			const onCommand = device.commands.on;
			const hexColor = onCommand ? normalizeHexColor(onCommand.type ?? '') : null;
			const borderHex =
				onCommand && onCommand.typeBorder
					? normalizeHexColor(onCommand.typeBorder)
					: hexColor;

			if (hexColor) {
				const borderColor = borderHex ?? hexColor;
				const background = lightenHex(hexColor, 0.9);
				cardStyle = [
					`border-color:${borderColor}`,
					`border-left-color:${borderColor}`,
					`background:${background}`
				].join(';');
				return `${baseCardClass} ${cardCustomClass}`;
			}

			return `${baseCardClass} ${cardOnClass}`;
		}

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
	type ToggleButtonState = CommandVisualState & {
		command: DeviceCommandKey;
		label: string;
	};

	let toggleState: ToggleButtonState | null = null;

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

	function computeButtonClass(
		command: DeviceCommandKey,
		key: string,
		options: { forceProminent?: boolean; forceNeutral?: boolean } = {}
	): ButtonVisual {
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

		if (options.forceNeutral) {
			classes.push(buttonNeutralClass);
		} else if (hexColor) {
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
			classes.push(options.forceProminent ? buttonOffProminentClass : buttonOffIdleClass);
		} else if (rawType === 'on') {
			classes.push(options.forceProminent ? buttonOnProminentClass : buttonOnIdleClass);
		} else if (command === 'off') {
			classes.push(options.forceProminent ? buttonOffProminentClass : buttonOffIdleClass);
		} else {
			classes.push(options.forceProminent ? buttonOnProminentClass : buttonOnIdleClass);
		}

		if (loadingCommandKey === key) {
			classes.push('ring-2 ring-blue-200 ring-offset-2 ring-offset-white');
		}

		return {
			className: classes.join(' '),
			style
		};
	}

	$: commandVisualStates = isToggle
		? {}
		: commandOrder.reduce(
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

	$: toggleState = (() => {
		if (!isToggle) return null;
		const stateCommand: DeviceCommandKey = optimisticStatus === 'on' ? 'on' : 'off';
		const actionCommand = resolveToggleCommand(optimisticStatus);
		if (!device.commands[stateCommand] || !device.commands[actionCommand]) return null;
		const actionKey = commandKey(device.id, actionCommand);
		const key = deviceLoading && loadingCommandKey ? loadingCommandKey : actionKey;
		const visual = computeButtonClass(actionCommand, key, { forceNeutral: true });
		const onCommand = device.commands.on;
		const onHexColor = onCommand ? normalizeHexColor(onCommand.type ?? '') : null;
		const onBorderHex =
			onCommand && onCommand.typeBorder
				? normalizeHexColor(onCommand.typeBorder)
				: onHexColor;
		const borderColor = onBorderHex ?? '#10b981';
		const accentBorderStyle =
			stateCommand === 'on' ? `border-color:${borderColor}` : undefined;
		const mergedStyle = [visual.style, accentBorderStyle].filter(Boolean).join(';');
		// Toggle labels describe the action, and the button stays neutral when state is on.
		const actionLabel = actionCommand === 'on' ? 'Zet aan' : 'Zet uit';
		return {
			key,
			className: visual.className,
			style: mergedStyle || undefined,
			ariaPressed: stateCommand === 'on',
			command: actionCommand,
			label: actionLabel
		};
	})();

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
		<div class={`flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${statusTextClass}`}>
			<span class={`h-2.5 w-2.5 rounded-full ${statusDotClass}`}></span>
			<span>{statusLabel}</span>
		</div>
	</div>

	<div class={`grid flex-1 ${commandGridClass} gap-4`}>
		{#if isToggle}
			{#if toggleState}
				<button
					type="button"
					class={toggleState.className}
					style={toggleState.style}
					aria-pressed={toggleState.ariaPressed}
					on:click={() => handleCommand(toggleState.command)}
				>
					<span class="pointer-events-none text-center">{toggleState.label}</span>
					{#if loadingCommandKey === toggleState.key}
						<span class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 text-sm font-semibold uppercase tracking-wide text-white">
							Bezig…
						</span>
					{/if}
				</button>
			{/if}
		{:else}
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
								<span class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 text-sm font-semibold uppercase tracking-wide text-white">
									Bezig…
								</span>
							{/if}
						</button>
					{/if}
				{/if}
			{/each}
		{/if}
	</div>
</section>
