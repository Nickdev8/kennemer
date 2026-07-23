<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import ArrowUp from 'lucide-svelte/icons/arrow-up';
	import type { DeviceCommandKey, ShellyDevice } from '$lib/config/schema';
	import { isDeviceCommandConfigured } from '$lib/config/device-validation';

	const baseCardClass =
		'flex h-full max-h-[18rem] min-h-[12rem] flex-col gap-3 rounded-lg border border-slate-300 bg-white px-5 py-5 transition-colors duration-150';
	const cardNeutralClass = 'bg-white';
	const cardOnClass = 'border-emerald-500 bg-emerald-50';
	const cardOffClass = 'bg-slate-50';
	const cardCustomClass = 'bg-white';

	const baseButtonClass =
		'relative flex w-full items-center justify-center rounded-lg border px-5 py-6 text-xl font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 max-h-32 min-h-[4rem]';
	const buttonOnIdleClass = 'border border-emerald-500 bg-white text-slate-700';
	const buttonOffIdleClass = 'border border-rose-500 bg-white text-slate-700';
	const buttonOnProminentClass =
		'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700';
	const buttonOffProminentClass = 'border-rose-700 bg-rose-600 text-white hover:bg-rose-700';
	const buttonNeutralClass = 'border-slate-800 bg-slate-800 text-white hover:bg-slate-700';
	const buttonToggleNeutralClass = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100';
	const buttonCustomClass = 'text-white';

	export let device: ShellyDevice;
	export let commandOrder: DeviceCommandKey[];
	export let commandKey: (deviceId: string, command: DeviceCommandKey) => string;
	export let commandLabel: (device: ShellyDevice, command: DeviceCommandKey) => string;
	export let loadingCommandKey: string | null;
	export let initialStatus: DeviceCommandKey | null = null;
	export let transientActive = false;
	export let showType = false;
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
	let isSingle = false;
	let isStateless = false;
	let commandGridClass = 'grid-cols-2';
	let hasTransientOn = false;

	const currentOptimisticKey = () =>
		optimisticStatus ? commandKey(device.id, optimisticStatus) : null;

	$: deviceLoading =
		typeof loadingCommandKey === 'string' && loadingCommandKey.startsWith(`${device.id}:`);

	$: isToggle = device.buttonMode === 'toggle';

	$: isSingle = device.buttonMode === 'single';

	$: isStateless = device.stateless === true;

	$: commandGridClass = isToggle || isSingle ? 'grid-cols-1' : 'grid-cols-2';

	$: {
		hasTransientOn =
			isSingle &&
			isStateless &&
			device.type === 'Scene' &&
			(initialStatus === 'on' || transientActive);
	}

	$: {
		if (isStateless || isSingle) {
			optimisticStatus = null;
			previousInitialStatus = initialStatus;
		} else if (initialStatus !== undefined && initialStatus !== previousInitialStatus) {
			previousInitialStatus = initialStatus;
			if (!deviceLoading) {
				optimisticStatus = initialStatus ?? null;
			}
		}
	}

	$: cardClassName = (() => {
		cardStyle = undefined;

		if (isStateless || isSingle) {
			return `${baseCardClass} ${cardNeutralClass}`;
		}

		if (optimisticStatus === 'on') {
			const onCommand = device.commands.on;
			const hexColor = onCommand ? normalizeHexColor(onCommand.type ?? '') : null;
			const borderHex =
				onCommand && onCommand.typeBorder ? normalizeHexColor(onCommand.typeBorder) : hexColor;

			if (hexColor) {
				const borderColor = borderHex ?? hexColor;
				const background = lightenHex(hexColor, 0.9);
				cardStyle = [`border-color:${borderColor}`, `background:${background}`].join(';');
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
		disabled: boolean;
	};

	let commandVisualStates: Partial<Record<DeviceCommandKey, CommandVisualState>> = {};
	type ToggleButtonState = CommandVisualState & {
		command: DeviceCommandKey;
		label: string;
	};

	let toggleState: ToggleButtonState | null = null;
	type SingleButtonState = CommandVisualState & {
		command: DeviceCommandKey;
		label: string;
	};
	let singleState: SingleButtonState | null = null;

	const hexColorRegex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

	function normalizeHexColor(color: string): string | null {
		const trimmed = color.trim();
		if (!hexColorRegex.test(trimmed)) return null;
		if (trimmed.length === 4) {
			const [, r, g, b] = trimmed.split('');
			return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
		}
		return trimmed.toLowerCase();
	}

	function getTextColor(hexColor: string): string {
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
		options: { forceProminent?: boolean; forceNeutral?: boolean; forceToggleNeutral?: boolean } = {}
	): ButtonVisual {
		const config = device.commands[command];
		const typeValue = config?.type;
		const typeString =
			typeof typeValue === 'string' ? typeValue : typeValue === undefined ? '' : String(typeValue);
		const rawType = typeString.trim().toLowerCase();
		const hexColor = normalizeHexColor(typeString);
		const borderHex = normalizeHexColor(config?.typeBorder ?? '') ?? hexColor;

		const classes = [baseButtonClass];
		let style: string | undefined;

		if (options.forceToggleNeutral) {
			classes.push(buttonToggleNeutralClass);
		} else if (options.forceNeutral) {
			classes.push(buttonNeutralClass);
		} else if (hexColor) {
			const textColor = getTextColor(hexColor);
			const borderColor = borderHex ?? hexColor;
			classes.push(buttonCustomClass);
			style = [`background:${hexColor}`, `border-color:${borderColor}`, `color:${textColor}`].join(
				';'
			);
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
			classes.push('opacity-70');
		}

		return {
			className: classes.join(' '),
			style
		};
	}

	$: commandVisualStates =
		isToggle || isSingle
			? {}
			: commandOrder.reduce(
					(acc, command) => {
						if (!device.commands[command]) return acc;
						const key = commandKey(device.id, command);
						const visual = computeButtonClass(command, key, { forceProminent: true });
						acc[command] = {
							key,
							className: visual.className,
							style: visual.style,
							ariaPressed: optimisticStatus === command,
							disabled: !isDeviceCommandConfigured(device, command)
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
		const showGreenAction = actionCommand === 'off';
		const actionConfigured = isDeviceCommandConfigured(device, actionCommand);
		const visualCommand: DeviceCommandKey = showGreenAction ? 'on' : actionCommand;
		const visual = computeButtonClass(visualCommand, key, {
			forceProminent: showGreenAction,
			forceToggleNeutral: !showGreenAction
		});
		const actionLabel = actionConfigured
			? actionCommand === 'on'
				? 'Uit'
				: 'Aan'
			: device.type === 'Scene'
				? 'Scène niet ingesteld'
				: 'Niet ingesteld';
		return {
			key,
			className: visual.className,
			style: visual.style,
			ariaPressed: stateCommand === 'on',
			disabled: !actionConfigured,
			command: actionCommand,
			label: actionLabel
		};
	})();

	$: singleState = (() => {
		if (!isSingle) return null;
		const command: DeviceCommandKey = 'on';
		if (!device.commands.on) return null;
		const key = commandKey(device.id, command);
		const commandConfigured = isDeviceCommandConfigured(device, command);
		const isTimedScene = isStateless && device.type === 'Scene';
		const visual = isTimedScene
			? {
					className: [
						baseButtonClass,
						hasTransientOn
							? 'border-emerald-500 bg-emerald-100 text-emerald-900 disabled:opacity-100'
							: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
					].join(' ')
				}
			: computeButtonClass(command, key, { forceProminent: true });
		return {
			key,
			className: visual.className,
			style: visual.style,
			ariaPressed: hasTransientOn,
			disabled: !commandConfigured || deviceLoading || hasTransientOn,
			command,
			label: commandConfigured
				? (device.commands.on?.label ?? '')
				: device.type === 'Scene'
					? 'Scène niet ingesteld'
					: 'Niet ingesteld'
		};
	})();

	function handleCommand(command: DeviceCommandKey) {
		if (!isDeviceCommandConfigured(device, command) || deviceLoading || hasTransientOn) return;
		const key = commandKey(device.id, command);
		if (!isStateless && !isSingle) {
			optimisticStatus = command;
		}
		dispatch('command', { deviceId: device.id, command });
	}
</script>

<section class={cardClassName} style={cardStyle}>
	<div class="flex items-center justify-between gap-4">
		<div class="min-w-0">
			<h3 class="truncate text-lg font-semibold tracking-tight text-slate-800 sm:text-xl">
				{device.label}
			</h3>
			{#if showType}
				<p class="text-xs tracking-wide text-slate-400 uppercase">{device.type}</p>
			{/if}
		</div>
	</div>

	<div class={`grid flex-1 ${commandGridClass} gap-4`}>
		{#if isSingle}
			{#if singleState}
				<button
					type="button"
					class={singleState.className}
					style={singleState.style}
					aria-pressed={singleState.ariaPressed}
					disabled={singleState.disabled}
					on:click={() => handleCommand(singleState.command)}
				>
					<span
						class="pointer-events-none inline-flex items-center justify-center gap-3 text-center"
					>
						{#if device.commands[singleState.command]?.icon === 'arrow-up'}
							<ArrowUp class="h-7 w-7" aria-hidden="true" />
						{/if}
						{singleState.label}
					</span>
					{#if loadingCommandKey === singleState.key}
						<span
							class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/60 text-sm font-semibold text-white"
						>
							Bezig…
						</span>
					{/if}
				</button>
			{/if}
		{:else if isToggle}
			{#if toggleState}
				<button
					type="button"
					class={toggleState.className}
					style={toggleState.style}
					aria-pressed={toggleState.ariaPressed}
					disabled={toggleState.disabled}
					on:click={() => handleCommand(toggleState.command)}
				>
					<span class="pointer-events-none text-center">{toggleState.label}</span>
					{#if loadingCommandKey === toggleState.key}
						<span
							class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/60 text-sm font-semibold text-white"
						>
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
							disabled={state.disabled}
							on:click={() => handleCommand(cmd)}
						>
							<span class="pointer-events-none text-center">{commandLabel(device, cmd)}</span>
							{#if loadingCommandKey === state.key}
								<span
									class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/60 text-sm font-semibold text-white"
								>
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
