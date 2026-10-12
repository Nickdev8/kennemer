<script lang="ts">
	import { onMount } from 'svelte';

	type Config = {
		paused: boolean;
		active_profile: string;
		weekdays: number[];
		gap_seconds: number;
		profiles: Record<string, string[]>;
		timezone: string;
	};
	type BellEvent = { at: string; profile: string; time: string };
	type RelayHealth = Record<string, unknown>;
	type BellOutcome = {
		ok?: boolean;
		error?: string;
		skipped?: string;
		pulses?: Array<{ relays?: Array<{ relay?: string; ok?: boolean }> }>;
	};

	let config: Config | null = null;
	let selectedMode = 'off';
	let revision = 0;
	let draft = '';
	let pin = '';
	let busy = false;
	let message = '';
	let status: Record<string, unknown> | null = null;
	let outcome: BellOutcome | null = null;
	let lastEvent: { status?: string; created?: string } | null = null;
	let relayHealth: RelayHealth[] = [];
	let editing = false;
	let preview = false;
	let connectionError = false;
	let retryAfter = 0;
	const names = {
		regular: 'Regulier',
		short: 'Verkort',
		'ten-minute': '10-minutenbel',
		off: 'Uit'
	};

	$: nextBell = status?.next_event as BellEvent | null;
	$: savedMode = config ? (config.paused ? 'off' : config.active_profile) : 'off';
	$: modeDirty = selectedMode !== savedMode;
	$: clockOk = (status?.clock as Record<string, unknown> | undefined)?.synchronized === true;
	$: serviceOk = Boolean((status?.scheduler as Record<string, unknown> | undefined)?.last_scan);
	$: lastOutcomeFailed = (status?.last_outcome as Record<string, unknown> | undefined)?.status === 'failed';
	$: relaysOk = relayHealth.length === 2 && relayHealth.every((relay) =>
		relay.reachable && relay.identity_ok && relay.initial_state_off && relay.output_off && relay.auto_off_seconds === 1
	);
	$: fault = !preview && status && (!clockOk || !serviceOk || !relaysOk || lastOutcomeFailed);

	function nextBellLabel(event: BellEvent) {
		return new Intl.DateTimeFormat('nl-NL', {
			weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
		}).format(new Date(event.at));
	}

	function requestId() {
		const bytes = crypto.getRandomValues(new Uint32Array(4));
		return Array.from(bytes, (part) => part.toString(16).padStart(8, '0')).join('');
	}

	function outcomeCount(relayId: string) {
		return (outcome?.pulses ?? []).filter((pulse) =>
			pulse.relays?.some((relay) => relay.relay === relayId && relay.ok)
		).length;
	}

	async function read(operation: string) {
		const response = await fetch(`/api/bells/${operation}`);
		const result = await response.json();
		if (!response.ok) throw new Error(result.error ?? result.message ?? 'Belservice niet bereikbaar.');
		return result;
	}

	async function refresh(load = false) {
		try {
			status = await read('status');
			preview = status?.preview === true;
			const last = status?.last_outcome as { outcome?: string; status?: string; created?: string } | undefined;
			lastEvent = last ?? null;
			try { outcome = last?.outcome ? JSON.parse(last.outcome) : null; }
			catch { outcome = { error: 'Uitkomst niet leesbaar' }; }
			if (message === 'Bel gestart.' && last?.outcome) message = '';
			relayHealth = (status?.relay_health as RelayHealth[]) ?? [];
			if (load || !config) {
				const result = await read('config');
				config = result.config;
				revision = result.revision;
				draft = JSON.stringify(config, null, 2);
				selectedMode = config?.paused ? 'off' : config?.active_profile ?? 'off';
			}
			if (connectionError) message = '';
			connectionError = false;
			retryAfter = 0;
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
			connectionError = true;
			retryAfter = Date.now() + 10000;
		}
	}

	async function mutate(operation: string, data: unknown) {
		if (!pin.trim()) { message = 'Vul de configuratie-PIN in.'; return false; }
		busy = true;
		message = '';
		try {
			const response = await fetch(`/api/bells/${operation}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-kennemer-config-pin': pin },
				body: JSON.stringify(data)
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? result.message ?? 'Actie mislukt.');
			message = operation === 'demo' ? 'Bel gestart.' : '';
			await refresh(operation !== 'demo');
			return true;
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
			return false;
		} finally {
			busy = false;
		}
	}

	async function save() {
		try {
			const next = JSON.parse(draft) as Config;
			next.paused = selectedMode === 'off';
			next.active_profile = selectedMode === 'off' ? config?.active_profile ?? 'regular' : selectedMode;
			await mutate('config', { revision, config: next });
		} catch {
			message = 'Ongeldige JSON. Concept bewaard.';
		}
	}

	async function saveMode() {
		if (!config) return;
		const next = {
			...config,
			paused: selectedMode === 'off',
			active_profile: selectedMode === 'off' ? config.active_profile : selectedMode
		};
		await mutate('config', { revision, config: next });
	}

	function download() {
		const blob = new Blob([draft], { type: 'application/json' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = 'belrooster.json';
		link.click();
		URL.revokeObjectURL(link.href);
	}

	async function importFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) {
			draft = await file.text();
			editing = true;
			message = 'Import geladen. Sla op met PIN.';
		}
	}

	onMount(() => {
		void refresh(true);
		const timer = setInterval(() => { if (!document.hidden && Date.now() >= retryAfter) void refresh(); }, 3000);
		return () => clearInterval(timer);
	});
</script>

<section class="mb-4 border-b border-slate-200 pb-4" aria-labelledby="bell-manager-title">
	<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
		<h3 id="bell-manager-title" class="text-base font-semibold text-slate-900">Schoolbel</h3>
		{#if preview}
			<span class="text-sm text-slate-600">Lokaal voorbeeld · bediening op ODROID</span>
		{:else if fault}
			<span class="text-sm font-medium text-red-700">Belservice controleren</span>
		{:else if config && !config.paused && nextBell}
			<span class="text-sm text-slate-600">Volgende bel: {nextBellLabel(nextBell)}</span>
		{/if}
	</div>

	{#if config}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Belrooster">
			{#each Object.entries(names) as [id, label]}
				<label class="flex min-h-14 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-900">
					<input type="radio" name="bell-mode" value={id} checked={selectedMode === id} disabled={busy || preview} on:change={() => { selectedMode = id; message = ''; }} />
					{label}
				</label>
			{/each}
		</div>

		<div class="mt-2 flex flex-wrap items-center gap-2">
			{#if !preview}
				<input class="min-h-12 w-28 rounded-md border border-slate-300 px-3" type="password" autocomplete="off" placeholder="PIN" aria-label="Configuratie-PIN" bind:value={pin} />
			{/if}
			<button disabled={busy || preview || !modeDirty} on:click={saveMode}>Opslaan</button>
			<button disabled={busy || preview} on:click={() => mutate('demo', { request_id: requestId(), count: 1 })}>Bel nu 1×</button>
			<button disabled={busy || preview} on:click={() => mutate('demo', { request_id: requestId(), count: 2 })}>Bel nu 2×</button>
			<button on:click={() => editing = !editing}>{editing ? 'Sluiten' : 'Tijden bewerken'}</button>
			{#if status && !preview}
				<details class="ml-auto text-sm text-slate-700" open={Boolean(fault)}>
					<summary class="cursor-pointer">Belstatus</summary>
					<div class="mt-2 space-y-1">
						<p>Klok: {clockOk ? 'goed' : 'niet gesynchroniseerd'} · Service: {serviceOk ? 'actief' : 'niet actief'}</p>
						{#each relayHealth as relay}
							<p>Bel school {relay.id === 'a8032abc4264' ? '1' : '2'}: {relay.reachable && relay.identity_ok && relay.initial_state_off && relay.output_off && relay.auto_off_seconds === 1 ? 'gereed' : 'storing'}</p>
						{/each}
						{#if lastEvent}
							<p>Laatste bel: {lastEvent.status === 'claimed' ? 'bezig' : outcome?.skipped ? 'overgeslagen' : outcome?.ok ? 'gelukt' : 'mislukt'}{#if outcome?.pulses?.length} · {outcome.pulses.length}×{/if}</p>
							{#if outcome?.pulses?.length}
								<p>School 1: {outcomeCount('a8032abc4264')}/{outcome.pulses.length} · School 2: {outcomeCount('08b61fd8993c')}/{outcome.pulses.length}</p>
							{:else if outcome?.error}<p>{outcome.error}</p>{/if}
						{/if}
					</div>
				</details>
			{/if}
		</div>

		{#if editing}
			<div class="mt-3">
				<label class="block text-sm" for="bell-config">Tijden en weekdagen (08:10x2 = dubbele bel, maandag = 0)</label>
				<textarea id="bell-config" class="mt-2 w-full rounded-md border border-slate-300 p-3 font-mono text-sm" rows="12" bind:value={draft}></textarea>
				<div class="mt-2 flex flex-wrap items-center gap-2">
					<button disabled={busy || preview} on:click={save}>Opslaan</button>
					<button disabled={busy} on:click={() => refresh(true)}>Opnieuw laden</button>
					<button on:click={download}>Exporteren</button>
					<button disabled={busy || preview} on:click={() => { if (confirm('Vorig rooster herstellen?')) void mutate('restore', { revision }); }}>Herstellen</button>
					<label class="file-button">Importeren <input class="sr-only" type="file" accept="application/json,.json" on:change={importFile} /></label>
				</div>
			</div>
		{/if}
	{/if}
	{#if message}<p class="mt-2 text-sm" role="status">{message}</p>{/if}
</section>

<style>
	button, .file-button { display: inline-flex; align-items: center; min-height: 48px; padding: 8px 14px; border: 1px solid #94a3b8; border-radius: 6px; background: white; color: #0f172a; cursor: pointer; }
	button:disabled { opacity: .5; }
	.file-button:focus-within { outline: 2px solid #2563eb; outline-offset: 2px; }
</style>
