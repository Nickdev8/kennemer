<script lang="ts">
	import Info from 'lucide-svelte/icons/info';
	import Pin from 'lucide-svelte/icons/pin';
	export let pinned: boolean;
	export let informationOpen: boolean;
	export let close: () => void;
	export let activity: () => void;
	export let togglePin: () => void;
	export let toggleInformation: () => void;
</script>

<div
	class="fixed inset-0 z-40 flex flex-col bg-slate-900/80 px-4 py-6 sm:px-8"
	on:click={close}
	on:pointerdown={activity}
	on:keydown={activity}
	role="presentation"
	tabindex="-1"
>
	<div
		class="relative mx-auto flex w-[90vw] max-w-[1800px] flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
		role="dialog"
		aria-modal="true"
		aria-label="Geavanceerde bediening"
		tabindex="-1"
		on:keydown|stopPropagation
		on:click|stopPropagation
	>
		<header
			class="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="space-y-1">
				<h2 class="text-2xl font-semibold tracking-tight text-slate-900">Geavanceerde bediening</h2>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
					aria-label="Systeeminformatie"
					aria-expanded={informationOpen}
					on:click={() => {
						toggleInformation();
						activity();
					}}><Info class="h-5 w-5" /></button
				>
				<button
					type="button"
					class={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150 ${
						pinned
							? 'border-slate-800 bg-slate-800 text-white'
							: 'border-slate-300 text-slate-700 hover:bg-slate-100'
					}`}
					aria-pressed={pinned}
					aria-label={pinned ? 'Automatisch sluiten weer inschakelen' : 'Paneel vastzetten'}
					title={pinned
						? 'Vastgezet: automatisch sluiten staat uit'
						: 'Vastzetten zodat het paneel open blijft'}
					on:click={togglePin}
				>
					<Pin class="h-5 w-5" />
				</button>
				<button
					type="button"
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100"
					on:click={close}
				>
					Sluiten
				</button>
			</div>
		</header>
		<slot />
		<footer class="shrink-0 border-t border-slate-200 px-6 py-2 text-right text-xs text-slate-500">
			© 2026 Nick Esselman en Kennemer Lyceum Overveen. Alle rechten voorbehouden.
		</footer>
	</div>
</div>
