<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ShellyTrigger } from '$lib/config/schema';

	const baseCardClass =
		'flex h-full max-h-[18rem] min-h-[12rem] flex-col gap-3 rounded-lg border border-slate-300 bg-white px-5 py-5';
	const cardNeutralClass = 'bg-white';

	const baseButtonClass =
		'relative flex w-full items-center justify-center rounded-lg border px-5 py-6 text-xl font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 max-h-32 min-h-[4rem]';
	const buttonNeutralClass = 'border-slate-800 bg-slate-800 text-white hover:bg-slate-700';

	export let trigger: ShellyTrigger;
	export let loadingTriggerId: string | null = null;

	const dispatch = createEventDispatcher<{
		trigger: { triggerId: string };
	}>();

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

	type ButtonVisual = {
		className: string;
		style?: string;
	};

	$: isLoading = loadingTriggerId === trigger.id;
	$: isConfigured = Boolean(trigger.sceneId?.trim());

	let cardStyle: string | undefined;

	$: buttonVisual = (() => {
		const typeValue = trigger.type ?? '';
		const typeString = typeof typeValue === 'string' ? typeValue : String(typeValue ?? '');
		const rawType = typeString.trim().toLowerCase();
		const hexColor = normalizeHexColor(typeString);
		const borderHex = normalizeHexColor(trigger.typeBorder ?? '') ?? hexColor;
		const accentColor =
			borderHex ?? (rawType === 'on' ? '#10b981' : rawType === 'off' ? '#f43f5e' : undefined);

		const classes = [baseButtonClass];
		let style: string | undefined;

		cardStyle = accentColor ? `border-color:${accentColor}` : undefined;

		classes.push(buttonNeutralClass);

		if (isLoading) {
			classes.push('opacity-70');
		}

		return {
			className: classes.join(' '),
			style
		};
	})();

	function handleTrigger() {
		if (!isConfigured) return;
		dispatch('trigger', { triggerId: trigger.id });
	}
</script>

<section class={`${baseCardClass} ${cardNeutralClass}`} style={cardStyle}>
	<p class="text-sm font-semibold text-slate-700">Actie</p>
	<button
		type="button"
		class={buttonVisual.className}
		style={buttonVisual.style}
		disabled={isLoading || !isConfigured}
		on:click={handleTrigger}
	>
		<span class="pointer-events-none text-center">
			{isConfigured ? trigger.label : 'Scène niet ingesteld'}
		</span>
		{#if isLoading}
			<span
				class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/60 text-sm font-semibold text-white"
			>
				Bezig…
			</span>
		{/if}
	</button>
</section>
