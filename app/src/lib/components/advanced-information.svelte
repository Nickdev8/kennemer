<script lang="ts">
	export let clearDeviceCache: () => void;
	export let cacheClearing: boolean;
	export let cacheMessage: string;
	export let diagnosticProblemCount: number;
	export let diagnosticGroups: Array<{
		id: string;
		label: string;
		entries: Array<{ id: string; name: string; detail: string }>;
	}>;
	export let wattageDisabled: boolean;
	export let wattageError: string;
	export let wattageSummary: {
		unavailableCount: number;
		meteredCount: number;
		notMeteredCount: number;
		unknownCapabilityCount: number;
		cachedCount: number;
		cloudCount: number;
		lanRpcCount: number;
		lanStatusCount: number;
	} | null;
	export let wattageDebug: boolean;
	export let wattageDevices: Array<{
		name: string;
		source?: string;
		capability?: string;
		watts: number;
	}>;
	export let formatWatts: (value: number) => string;
</script>

<div class="grid items-start gap-4 md:grid-cols-2">
	<div class="rounded-lg border border-slate-300 bg-white p-4">
		<h3 class="text-base font-semibold text-slate-900">Systeem</h3>
		<div class="mt-3 grid gap-4">
			<button
				type="button"
				class="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 disabled:opacity-60"
				on:click={clearDeviceCache}
				disabled={cacheClearing}
			>
				{#if cacheClearing}
					Cache legen…
				{:else}
					Wis IP-cache
				{/if}
			</button>
			{#if cacheMessage}
				<p
					class="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"
				>
					{cacheMessage}
				</p>
			{/if}
		</div>
	</div>

	<div class="rounded-lg border border-slate-300 bg-white p-4">
		<div class="flex items-center justify-between gap-3">
			<h3 class="text-base font-semibold text-slate-900">Apparaatproblemen</h3>
			<span
				class={`text-sm font-semibold ${diagnosticProblemCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
			>
				{diagnosticProblemCount} meldingen
			</span>
		</div>
		<div class="mt-3 border-t border-slate-200">
			{#each diagnosticGroups as group (group.id)}
				<details class="border-b border-slate-200">
					<summary
						class="flex cursor-pointer items-center justify-between gap-3 py-3 text-sm font-semibold text-slate-700"
					>
						<span>{group.label}</span>
						<span class={group.entries.length > 0 ? 'text-amber-700' : 'text-slate-400'}>
							{group.entries.length}
						</span>
					</summary>
					{#if group.entries.length === 0}
						<p class="pb-3 text-sm text-slate-500">Geen apparaten.</p>
					{:else}
						<ul class="space-y-3 pb-3">
							{#each group.entries as entry (`${group.id}:${entry.id}`)}
								<li>
									<p class="text-sm font-semibold text-slate-800">{entry.name}</p>
									<p class="mt-0.5 text-xs break-words text-slate-500">{entry.detail}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</details>
			{/each}
		</div>
	</div>

	<div class="rounded-lg border border-slate-300 bg-white p-4">
		<h3 class="text-base font-semibold text-slate-900">Vermogensdiagnostiek</h3>
		{#if wattageDisabled}
			<p class="mt-3 text-sm text-slate-600">Wattage is uitgeschakeld.</p>
		{:else if wattageError}
			<p class="mt-3 text-sm text-amber-700">{wattageError}</p>
		{:else if wattageSummary}
			<div class="mt-3 space-y-2 text-sm text-slate-700">
				{#if wattageSummary.unavailableCount > 0}
					<p class="font-semibold text-amber-700">
						{wattageSummary.unavailableCount} apparaten onbekend
					</p>
				{:else}
					<p class="text-slate-600">Geen ontbrekende metingen.</p>
				{/if}
				<div class="grid grid-cols-2 gap-2 text-xs text-slate-500">
					<span>Gemeten: {wattageSummary.meteredCount}</span>
					<span>Niet gemeten: {wattageSummary.notMeteredCount}</span>
					<span>Onbekend: {wattageSummary.unknownCapabilityCount}</span>
					<span>Fallback: {wattageSummary.cachedCount + wattageSummary.cloudCount}</span>
				</div>
			</div>
		{:else}
			<p class="mt-3 text-sm text-slate-600">Nog geen diagnoseresultaten.</p>
		{/if}
	</div>

	{#if wattageDebug}
		<details class="rounded-lg border border-slate-300 bg-white p-4">
			<summary class="cursor-pointer text-sm font-semibold text-slate-700">
				Diagnostische vermogenslijst
			</summary>
			{#if wattageSummary}
				<p class="mt-3 text-xs text-slate-400">
					RPC {wattageSummary.lanRpcCount} · Status {wattageSummary.lanStatusCount} · Cache {wattageSummary.cachedCount}
					· Cloud {wattageSummary.cloudCount}
				</p>
			{/if}
			{#if wattageDevices.length === 0}
				<p class="mt-3 text-sm text-slate-500">Geen vermogensgegevens.</p>
			{:else}
				<div class="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700">
					{#each wattageDevices as device}
						<div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
							<span class="truncate">{device.name}</span>
							<span class="ml-3 shrink-0 text-xs font-semibold text-slate-500">
								{device.source ?? 'unknown'} · {device.capability ?? 'unknown'} · {formatWatts(
									device.watts
								)}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</details>
	{/if}
</div>
