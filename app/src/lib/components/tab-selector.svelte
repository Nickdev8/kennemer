<script lang="ts">
	import KeyRound from 'lucide-svelte/icons/key-round';
	import { createEventDispatcher } from 'svelte';
	import type { DashboardTab } from '$lib/config/schema';
	export let tabs: Array<DashboardTab & { protected?: boolean }>;
	export let selected: string;
	const dispatch = createEventDispatcher<{ select: string }>();
	$: ordered = [...tabs].sort((a, b) => a.order - b.order);
</script>

<nav class="grid max-h-[60vh] min-h-0 gap-2 overflow-y-auto" aria-label="Bedieningspagina's">
	{#each ordered as tab (tab.id)}
		<button
			type="button"
			class={`justify-between relative flex w-full min-w-0 items-center gap-2 rounded-lg border px-5 py-5 text-center text-lg font-bold transition-colors duration-150 ${selected === tab.id ? 'border-sky-600 bg-sky-500 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
			aria-current={selected === tab.id ? 'page' : undefined}
			on:click={() => dispatch('select', tab.id)}
		>
			{tab.label}
			{#if tab.id === 'advanced' || tab.id === 'schoolbel'}<KeyRound
					class="h-4 w-4 shrink-0"
					aria-hidden="true"
				/>
			{/if}
		</button>
	{/each}
</nav>
