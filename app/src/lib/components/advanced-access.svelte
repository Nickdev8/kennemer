<script lang="ts">
	export let closeAdvancedPrompt: () => void;
	export let markAdvancedActivity: () => void;
	export let advancedPatternConfigured: boolean;
	export let advancedAccessError: string;
	export let pinNodes: number[];
	export let advancedPin: string;
	export let appendAdvancedPinDigit: (node: number) => void;
	export let clearAdvancedPin: () => void;
	export let submitAdvancedPin: () => void;

	$: maskedPin = advancedPin
		? `${'•'.repeat(Math.max(0, advancedPin.length - 1))}${advancedPin.slice(-1)}`
		: '—';
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4"
	role="presentation"
	tabindex="-1"
	on:click={closeAdvancedPrompt}
	on:keydown={markAdvancedActivity}
>
	<div
		class="w-full max-w-md space-y-4 rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="advanced-prompt-title"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
		<div class="space-y-1">
			<h2 id="advanced-prompt-title" class="text-lg font-semibold text-slate-900">PIN vereist</h2>
			<p class="text-sm text-slate-600">Vul de PIN in om geavanceerde bediening te ontgrendelen.</p>
		</div>
		{#if !advancedPatternConfigured}
			<p class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
				Geavanceerde bediening is nog niet ingesteld. Neem contact op met de beheerder.
			</p>
		{/if}
		{#if advancedAccessError}
			<p
				class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
			>
				{advancedAccessError}
			</p>
		{/if}
		<div
			class="flex min-h-9 items-center justify-center rounded-md bg-slate-50 font-mono text-base tracking-[0.25em] text-slate-700"
			aria-label="PIN ingevoerd"
			aria-live="polite"
		>
			{maskedPin}
		</div>
		<div
			class="grid grid-cols-3 justify-items-center gap-4 select-none"
			aria-label="PIN-toetsenbord"
		>
			{#each pinNodes as node (node)}
				<button
					type="button"
					class={`flex h-16 w-16 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-lg font-semibold text-slate-600 transition-colors hover:bg-slate-100 ${node === 0 ? 'col-span-3 justify-self-center' : ''}`}
					aria-label={`PIN ${node}`}
					on:click={() => appendAdvancedPinDigit(node)}
				>
					{node}
				</button>
			{/each}
		</div>
		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
				on:click={closeAdvancedPrompt}
			>
				Annuleren
			</button>
			<button
				type="button"
				class="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
				on:click={clearAdvancedPin}
				disabled={!advancedPin}
			>
				Reset
			</button>
			<button
				type="button"
				class="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
				on:click={submitAdvancedPin}
				disabled={!advancedPin.trim()}
			>
				Ontgrendel
			</button>
		</div>
	</div>
</div>
