<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ShellyTrigger } from '$lib/config/schema';
	import { resolveControlColor } from '$lib/components/control-colors';

	const baseCardClass =
		'flex h-full max-h-[18rem] min-h-[12rem] flex-col gap-3 rounded-lg border border-slate-300 bg-white px-5 py-5';
	const baseButtonClass =
		'relative flex flex-1 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-800 px-5 py-6 text-xl font-semibold text-white transition-colors duration-150 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60';

	export let trigger: ShellyTrigger;
	export let loadingTriggerId: string | null = null;

	const dispatch = createEventDispatcher<{
		trigger: { triggerId: string };
	}>();

	$: isLoading = loadingTriggerId === trigger.id;
	$: isConfigured = Boolean(trigger.sceneId?.trim());
	$: triggerColor = resolveControlColor(trigger.color);
	$: triggerStyle = triggerColor
		? `background:${triggerColor.background};border-color:${triggerColor.border};color:${triggerColor.text}`
		: undefined;

	function handleTrigger() {
		if (!isConfigured) return;
		dispatch('trigger', { triggerId: trigger.id });
	}
</script>

<section class={baseCardClass}>
	<p class="text-lg font-semibold text-slate-800">{trigger.label}</p>
	<button
		type="button"
		class={baseButtonClass}
		style={triggerStyle}
		disabled={isLoading || !isConfigured}
		on:click={handleTrigger}
	>
		<span class="pointer-events-none text-center">
			{isConfigured ? trigger.label : 'Niet ingesteld'}
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
