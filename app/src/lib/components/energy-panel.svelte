<script lang="ts">
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	export let wattageLabel: string;
	export let wattageStale: boolean;
	export let wattageDisabled: boolean;
	export let wattageUpdatedAt: number | null;
	export let wattageLoading: boolean;
	export let handleManualWattageRefresh: () => void;
	export let wattageTotal: number;
	export let formatTotalWatts: (value: number) => string;
	export let loadingTriggerIds: Set<string>;
	export let energyDevicesTrigger: {
		id: string;
		label: string;
		enabled?: boolean;
		sceneId?: string;
	};
	export let openEnergyTriggerConfirmation: () => void;
	export let energyTriggerError: string;
	export let wattageSummary: { meteredCount: number } | null;
	export let availableWattageMeasurements: number;
	export let topWattageDevices: Array<{ name: string; watts: number }>;
	export let formatWatts: (value: number) => string;
	export let topWattageMax: number;
	export let wattageError: string;
	export let openAdvancedAccess: () => void;
</script>

<section class="flex w-[26rem] shrink-0 flex-col rounded-lg border border-slate-300 bg-white p-5">
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-sm font-semibold text-slate-700">Energie en apparaten</p>
			<h2 class="mt-1 text-xl font-semibold text-slate-900">{wattageLabel}</h2>
			<p class={`mt-1 text-xs ${wattageStale ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
				{#if wattageDisabled}
					Metingen uitgeschakeld
				{:else if wattageUpdatedAt}
					{wattageStale ? 'Verouderde data van' : 'Bijgewerkt om'}
					{new Date(wattageUpdatedAt).toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit'
					})}
				{:else if wattageLoading}
					Gegevens ophalen...
				{:else}
					Nog geen gegevens
				{/if}
			</p>
		</div>
		<button
			type="button"
			class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50"
			on:click={handleManualWattageRefresh}
			disabled={wattageLoading || wattageDisabled}
		>
			<RefreshCw class={`h-6 w-6 ${wattageLoading ? 'animate-spin' : ''}`} />
			<span class="sr-only">Ververs energiegegevens</span>
		</button>
	</div>

	<div class="mt-5 border-y border-slate-200 py-4">
		<p class="text-sm font-medium text-slate-600">Huidig gemeten vermogen</p>
		<p class="mt-1 text-5xl font-bold text-slate-950">
			{#if wattageDisabled}
				Uit
			{:else if wattageUpdatedAt}
				{formatTotalWatts(wattageTotal)}
			{:else}
				—
			{/if}
		</p>
	</div>

	<div class="mt-4">
		<button
			type="button"
			class="relative flex w-full items-center justify-center rounded-lg border border-red-800 bg-red-700 px-5 py-5 text-lg font-bold text-white transition-colors duration-150 hover:bg-red-800 disabled:cursor-wait disabled:opacity-70"
			disabled={loadingTriggerIds.has(energyDevicesTrigger.id) ||
				energyDevicesTrigger.enabled === false ||
				!energyDevicesTrigger.sceneId?.trim()}
			on:click={openEnergyTriggerConfirmation}
		>
			{#if loadingTriggerIds.has(energyDevicesTrigger.id)}
				Bezig…
			{:else}
				{energyDevicesTrigger.label}
			{/if}
		</button>
		{#if energyTriggerError}
			<p class="mt-2 text-sm font-semibold text-red-700">{energyTriggerError}</p>
		{/if}
	</div>

	<div class="mt-4 flex items-center justify-between border-b border-slate-200 pb-4">
		<span class="text-sm text-slate-600">Vermogensmetingen</span>
		<span class="text-sm font-semibold text-slate-900">
			{#if wattageSummary}
				{availableWattageMeasurements} van {wattageSummary.meteredCount} beschikbaar
			{:else}
				—
			{/if}
		</span>
	</div>

	<div class="mt-4">
		<div class="flex items-baseline justify-between gap-3">
			<h3 class="text-sm font-semibold text-slate-900">Topverbruikers</h3>
			<span class="text-xs text-slate-500">Nu</span>
		</div>
		{#if topWattageDevices.length > 0}
			<ol class="mt-3 space-y-3">
				{#each topWattageDevices as device, index}
					<li>
						<div class="flex items-center justify-between gap-4 text-sm">
							<div class="flex min-w-0 items-center gap-2">
								<span class="w-4 shrink-0 text-xs font-semibold text-slate-400">{index + 1}</span>
								<span class="truncate font-medium text-slate-700">{device.name}</span>
							</div>
							<span class="shrink-0 font-semibold text-slate-900">{formatWatts(device.watts)}</span>
						</div>
						<div class="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-sm bg-slate-100">
							<div
								class="h-full bg-emerald-600 transition-[width] duration-500"
								style={`width: ${Math.max(4, (device.watts / topWattageMax) * 100)}%`}
							></div>
						</div>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="mt-3 text-sm text-slate-500">
				{wattageLoading ? 'Verbruikers ophalen...' : 'Geen actief verbruik gemeten'}
			</p>
		{/if}
	</div>

	{#if wattageError}
		<p
			class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
		>
			{wattageStale ? 'Vernieuwen mislukt. De vorige gegevens blijven zichtbaar.' : wattageError}
		</p>
	{/if}

	<div class="mt-auto grid gap-2 pt-4">
		<slot />
		<button
			type="button"
			class="relative flex w-full items-center justify-center rounded-lg border border-slate-300 px-5 py-5 text-lg font-bold text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
			on:click={openAdvancedAccess}
		>
			<span>Geavanceerde bediening</span>
		</button>
	</div>
</section>
