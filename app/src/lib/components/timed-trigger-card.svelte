<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { TimedShellyTrigger } from '$lib/config/schema';
	import { resolveControlColor } from '$lib/components/control-colors';

	const baseCardClass =
		'flex h-full max-h-[18rem] min-h-[12rem] flex-col gap-3 rounded-lg border border-slate-300 bg-white px-5 py-5';
	const baseButtonClass =
		'relative flex flex-1 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-800 px-5 py-6 text-xl font-semibold text-white transition-colors duration-150 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60';

	export let trigger: TimedShellyTrigger;
	export let loadingTriggerId: string | null = null;
	export let activeUntil: number | null = null;

	const dispatch = createEventDispatcher<{
		trigger: { triggerId: string };
	}>();

	let now = Date.now();
	let clockInterval: ReturnType<typeof setInterval> | null = null;
	$: isLoading = loadingTriggerId === trigger.id;
	$: isActive = Boolean(activeUntil && activeUntil > now);
	$: elapsedMs = isActive && activeUntil ? trigger.activeDurationMs - (activeUntil - now) : 0;
	$: progressPercent = Math.min(100, (elapsedMs / trigger.activeDurationMs) * 100);
	$: buttonText = isActive ? formatElapsed(elapsedMs) : trigger.buttonLabel;
	$: triggerColor = resolveControlColor(trigger.color);
	$: triggerStyle = triggerColor
		? `background:${triggerColor.background};border-color:${triggerColor.border};color:${triggerColor.text}`
		: undefined;

	onMount(() => {
		clockInterval = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => {
			if (clockInterval) clearInterval(clockInterval);
		};
	});

	function handleTrigger() {
		if (isActive) return;
		dispatch('trigger', { triggerId: trigger.id });
	}

	function formatElapsed(milliseconds: number) {
		const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}
</script>

<section class={baseCardClass}>
	<p class="text-lg font-semibold text-slate-800">{trigger.label}</p>
	<button
		type="button"
		class={baseButtonClass}
		style={triggerStyle}
		disabled={isLoading || isActive}
		on:click={handleTrigger}
	>
		<span class="pointer-events-none text-center" aria-live={isActive ? 'polite' : undefined}>
			{buttonText}
		</span>
		{#if isActive}
			<span
				class="pointer-events-none absolute bottom-0 left-0 h-1 rounded-b-lg bg-white/70 transition-[width] duration-1000 ease-linear"
				style={`width:${progressPercent}%`}
			></span>
		{/if}
		{#if isLoading}
			<span
				class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/60 text-sm font-semibold text-white"
			>
				Bezig…
			</span>
		{/if}
	</button>
</section>
