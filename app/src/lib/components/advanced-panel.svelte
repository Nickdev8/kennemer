<script lang="ts">
	import Info from 'lucide-svelte/icons/info';
	export let informationOpen: boolean;
	export let activity: () => void;
	export let toggleInformation: () => void;
	export let showFooter = true;
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Geavanceerde bediening">
	<slot />
	{#if showFooter}<div
			class="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-6 py-4"
		>
			<button
				type="button"
				class="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
				aria-label="Systeeminformatie"
				aria-expanded={informationOpen}
				aria-haspopup="dialog"
				on:click={() => {
					toggleInformation();
					activity();
				}}><Info class="h-5 w-5" /></button
			>
			<slot name="actions" />
		</div>{/if}
</div>
