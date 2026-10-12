<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { DashboardTab } from '$lib/config/schema';
	export let tabs: DashboardTab[];
	export let selected: string;
	const dispatch = createEventDispatcher<{ select: string }>();
	$: ordered = [...tabs].sort((a, b) => a.order - b.order);
</script>

<nav class="grid max-h-[40vh] gap-2 overflow-y-auto" aria-label="Bedieningspagina's">
	{#each ordered as tab (tab.id)}
		<button
			type="button"
			class={`relative flex w-full items-center justify-center rounded-lg border px-5 py-5 text-lg font-bold transition-colors duration-150 ${selected === tab.id ? 'border-sky-600 bg-sky-500 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
			aria-current={selected === tab.id ? 'page' : undefined}
			on:click={() => dispatch('select', tab.id)}>{tab.label}</button
		>
	{/each}
</nav>
