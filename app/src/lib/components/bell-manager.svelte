<script lang="ts">
	import { onMount } from 'svelte';
	import { BellRing } from 'lucide-svelte';

	type Config = {
		paused: boolean;
		active_profile: string;
		weekdays: number[];
		gap_seconds: number;
		profiles: Record<string, string[]>;
		timezone: string;
	};
	type ProfileId = 'regular' | 'short' | 'ten-minute';
	type TimeEntry = { time: string; count: 1 | 2 };
	type BellEvent = { at: string; profile: string; time: string };
	type RelayHealth = Record<string, unknown>;
	type BellOutcome = {
		ok?: boolean;
		error?: string;
		skipped?: string;
		pulses?: Array<{ relays?: Array<{ relay?: string; ok?: boolean }> }>;
	};

	let config: Config | null = null;
	let draftConfig: Config | null = null;
	let selectedMode = 'off';
	let editingProfile: ProfileId = 'regular';
	let editingEntries: TimeEntry[] = [];
	let revision = 0;
	let pin = '';
	let pinVerified = false;
	let pinCheck = 0;
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
	let healthFailureStreak = 0;
	const names = {
		regular: 'Regulier',
		short: 'Verkort',
		'ten-minute': '10-minutenbel',
		off: 'Uit'
	};
	const profileNames: Record<ProfileId, string> = {
		regular: 'Regulier',
		short: 'Verkort',
		'ten-minute': '10-minutenbel'
	};
	const weekdays = [
		{ value: 0, label: 'Ma' },
		{ value: 1, label: 'Di' },
		{ value: 2, label: 'Wo' },
		{ value: 3, label: 'Do' },
		{ value: 4, label: 'Vr' }
	];

	$: nextBell = status?.next_event as BellEvent | null;
	$: editingEntries = (draftConfig?.profiles?.[editingProfile] ?? []).map(parseTimeEntry);
	$: entryHours = Array.from(new Set(editingEntries.map((entry) => entry.time.slice(0, 2))));
	$: profileCounts = Object.fromEntries(Object.entries(draftConfig?.profiles ?? {}).map(([id, times]) => [id, times.length]));
	$: savedMode = config ? (config.paused ? 'off' : config.active_profile) : 'off';
	$: modeDirty = selectedMode !== savedMode;
	$: clockOk = (status?.clock as Record<string, unknown> | undefined)?.synchronized === true;
	$: serviceOk = Boolean((status?.scheduler as Record<string, unknown> | undefined)?.last_scan);
	$: lastOutcomeFailed = (status?.last_outcome as Record<string, unknown> | undefined)?.status === 'failed' && !outcome?.skipped;
	$: relaysOk = relayHealth.length === 2 && relayHealth.every((relay) =>
		relay.reachable && relay.identity_ok && relay.initial_state_off && relay.output_off && relay.auto_off_seconds === 1
	);
	$: fault = !preview && status && (healthFailureStreak >= 2 || lastOutcomeFailed);

	function nextBellLabel(event: BellEvent) {
		return new Intl.DateTimeFormat('nl-NL', {
			weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
		}).format(new Date(event.at));
	}

	function parseTimeEntry(value: string): TimeEntry {
		const match = /^(\d{2}:\d{2})(?:x([12]))?$/.exec(value);
		return { time: match?.[1] ?? '08:00', count: match?.[2] === '2' ? 2 : 1 };
	}

	function serializeTimeEntry(entry: TimeEntry) {
		return entry.count === 2 ? `${entry.time}x2` : entry.time;
	}

	function setProfileEntries(entries: TimeEntry[]) {
		if (!draftConfig) return;
		draftConfig = {
			...draftConfig,
			profiles: {
				...draftConfig.profiles,
				[editingProfile]: entries.map(serializeTimeEntry)
			}
		};
		message = '';
	}

	function updateTimeEntry(index: number, update: Partial<TimeEntry>) {
		const entries = editingEntries.map((entry) => ({ ...entry }));
		const next = { ...entries[index], ...update };
		if (entries.some((entry, entryIndex) => entryIndex !== index && entry.time === next.time)) {
			message = 'Deze tijd staat al in het rooster.';
			return;
		}
		entries[index] = next;
		setProfileEntries(entries);
	}

	function addTimeEntry() {
		if (editingEntries.length >= 200) {
			message = 'Dit rooster kan maximaal 200 belmomenten bevatten.';
			return;
		}
		let minuteOfDay = editingEntries.length
			? Number(editingEntries[editingEntries.length - 1].time.slice(0, 2)) * 60 +
				Number(editingEntries[editingEntries.length - 1].time.slice(3)) +
				10
			: 8 * 60;
		const existingTimes = new Set(editingEntries.map((entry) => entry.time));
		while (minuteOfDay < 24 * 60) {
			const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
			if (!existingTimes.has(time)) {
				setProfileEntries([...editingEntries, { time, count: 1 }]);
				return;
			}
			minuteOfDay += 10;
		}
		message = 'Geen vrije tijd meer vandaag.';
	}

	function toggleWeekday(day: number) {
		if (!draftConfig) return;
		const selected = draftConfig.weekdays.includes(day);
		if (selected && draftConfig.weekdays.length === 1) {
			message = 'Kies minstens één werkdag.';
			return;
		}
		draftConfig = {
			...draftConfig,
			weekdays: selected
				? draftConfig.weekdays.filter((value) => value !== day)
				: [...draftConfig.weekdays, day].sort((left, right) => left - right)
		};
		message = '';
	}

	function updateGap(value: string) {
		if (!draftConfig) return;
		const gap = Number(value);
		if (Number.isInteger(gap) && gap >= 0 && gap <= 30) {
			draftConfig = { ...draftConfig, gap_seconds: gap };
			message = '';
		}
	}

	function requestId() {
		const bytes = crypto.getRandomValues(new Uint32Array(4));
		return Array.from(bytes, (part) => part.toString(16).padStart(8, '0')).join('');
	}

	function maskedPin(value: string) {
		return value ? `${'•'.repeat(Math.max(0, value.length - 1))}${value.slice(-1)}` : '';
	}

	function appendUniquePinDigits(value: string) {
		for (const digit of value) {
			if (/\d/.test(digit) && !pin.includes(digit)) pin += digit;
		}
	}

	function handlePinInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		pinVerified = false;
		pinCheck += 1;
		const visibleBeforeInput = maskedPin(pin);
		const nextValue = input.value;

		if (nextValue.startsWith(visibleBeforeInput)) {
			appendUniquePinDigits(nextValue.slice(visibleBeforeInput.length));
		} else if (visibleBeforeInput.startsWith(nextValue)) {
			pin = pin.slice(0, nextValue.length);
		} else if (/^\d*$/.test(nextValue)) {
			pin = '';
			appendUniquePinDigits(nextValue);
		}

		input.value = maskedPin(pin);
		input.setSelectionRange(input.value.length, input.value.length);
	}

	async function verifyPin() {
		const candidate = pin;
		const check = ++pinCheck;
		if (!candidate) {
			pinVerified = false;
			return;
		}
		try {
			const response = await fetch('/api/bells/verify-pin', {
				method: 'POST',
				headers: { 'x-kennemer-config-pin': candidate }
			});
			if (check === pinCheck && candidate === pin) pinVerified = response.ok;
		} catch {
			if (check === pinCheck) pinVerified = false;
		}
	}

	function movePinCaretToEnd(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
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
			const clockReady = (status?.clock as Record<string, unknown> | undefined)?.synchronized === true;
			const serviceReady = Boolean((status?.scheduler as Record<string, unknown> | undefined)?.last_scan);
			const relaysReady = relayHealth.length === 2 && relayHealth.every((relay) =>
				relay.reachable && relay.identity_ok && relay.initial_state_off && relay.output_off && relay.auto_off_seconds === 1
			);
			healthFailureStreak = clockReady && serviceReady && relaysReady ? 0 : healthFailureStreak + 1;
			if (load || !config) {
				const result = await read('config');
				const loadedConfig = result.config as Config;
				config = loadedConfig;
				draftConfig = JSON.parse(JSON.stringify(loadedConfig)) as Config;
				revision = result.revision;
				selectedMode = loadedConfig.paused ? 'off' : loadedConfig.active_profile;
				if (loadedConfig.active_profile in profileNames) editingProfile = loadedConfig.active_profile as ProfileId;
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
			pinVerified = true;
			message = operation === 'demo' ? 'Bel gestart.' : '';
			await refresh(operation !== 'demo');
			return true;
		} catch (error) {
			if (error instanceof Error && error.message.includes('PIN')) pinVerified = false;
			message = error instanceof Error ? error.message : String(error);
			return false;
		} finally {
			busy = false;
		}
	}

	async function save() {
		if (!config || !draftConfig) return;
		const next = JSON.parse(JSON.stringify(draftConfig)) as Config;
		// Saving roster times must not implicitly apply an uncommitted mode choice.
		next.paused = config.paused;
		next.active_profile = config.active_profile;
		await mutate('config', { revision, config: next });
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
		const blob = new Blob([JSON.stringify(draftConfig ?? config, null, 2)], { type: 'application/json' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = 'belrooster.json';
		link.click();
		URL.revokeObjectURL(link.href);
	}

	async function importFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file || !config) return;
		try {
			const imported = JSON.parse(await file.text()) as Config;
			if (!imported || !imported.profiles || !Array.isArray(imported.weekdays)) {
				throw new Error('invalid roster');
			}
			imported.paused = config.paused;
			imported.active_profile = config.active_profile;
			draftConfig = imported;
			if (imported.active_profile in profileNames) editingProfile = imported.active_profile as ProfileId;
			editing = true;
			message = 'Import geladen. Controleer het rooster en sla op met PIN.';
		} catch {
			message = 'Ongeldig roosterbestand.';
		}
	}

	onMount(() => {
		void refresh(true);
		const timer = setInterval(() => { if (!document.hidden && Date.now() >= retryAfter) void refresh(); }, 3000);
		return () => clearInterval(timer);
	});
</script>

<section class="bell-panel mb-4" aria-labelledby="bell-manager-title">
	<div class="mb-2 flex min-h-11 items-start justify-between gap-2">
		<div class="flex items-center gap-3">
			<div class="bell-mark" aria-hidden="true"><BellRing size={21} strokeWidth={2} /></div>
			<div>
				<h3 id="bell-manager-title" class="text-base font-semibold text-slate-900">Schoolbel</h3>
				<p class="text-xs text-slate-500">Rooster en handmatige bel</p>
			</div>
		</div>
		<div class="next-bell ml-auto w-52 shrink-0 text-right text-sm leading-5 sm:w-64">
			<div class="text-xs font-medium uppercase tracking-wide text-slate-500">Volgende bel</div>
			<div class="font-semibold text-slate-800">{config?.paused ? 'Uit' : nextBell ? nextBellLabel(nextBell) : 'onbekend'}</div>
			<div class="min-h-4 truncate text-xs">
				{#if preview}
					<span class="text-slate-600">Lokaal voorbeeld</span>
				{:else if fault}
					<span class="font-medium text-red-700">Belservice controleren</span>
				{/if}
			</div>
		</div>
	</div>

	{#if config}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Belrooster">
			{#each Object.entries(names) as [id, label]}
				<label class={`mode-option flex min-h-14 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${selectedMode === id ? `selected ${id === 'off' ? 'paused' : ''}` : ''}`}>
					<input type="radio" name="bell-mode" value={id} checked={selectedMode === id} disabled={busy || preview} on:change={() => { selectedMode = id; message = ''; }} />
					{label}
				</label>
			{/each}
		</div>

		<div class="bell-actions mt-3 flex flex-wrap items-center gap-2 rounded-lg p-2">
			{#if !preview}
				<div class="flex items-center gap-2">
					<input class={`min-h-12 w-28 rounded-md border px-3 ${pinVerified ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300'}`} type="text" inputmode="numeric" autocomplete="off" autocapitalize="off" maxlength="10" placeholder="PIN" aria-label="Configuratie-PIN" value={maskedPin(pin)} on:input={handlePinInput} on:focus={movePinCaretToEnd} on:click={movePinCaretToEnd} on:blur={verifyPin} />
					{#if pinVerified}<span class="text-sm font-medium text-emerald-700" role="status" aria-label="PIN gecontroleerd">✓ PIN klopt</span>{/if}
				</div>
			{/if}
			<button class="save-action" disabled={busy || preview || !modeDirty} on:click={saveMode}>Modus opslaan</button>
			<button class="demo-action" disabled={busy || preview} on:click={() => mutate('demo', { request_id: requestId(), count: 1 })}>Bel nu 1×</button>
			<button class="demo-action" disabled={busy || preview} on:click={() => mutate('demo', { request_id: requestId(), count: 2 })}>Bel nu 2×</button>
			<button class="edit-action" on:click={() => editing = !editing}>{editing ? 'Sluiten' : 'Tijden bewerken'}</button>
			{#if status && !preview}
				<details class="ml-auto text-sm text-slate-700">
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
			<div class="mt-3 space-y-3">
				{#if draftConfig}
					<div role="tablist" aria-label="Rooster kiezen" class="grid grid-cols-3 gap-2 border-b border-slate-200 pb-2">
						{#each Object.entries(profileNames) as [profile, label]}
							<button
								type="button"
								role="tab"
								aria-selected={editingProfile === profile}
								class={`flex min-h-14 flex-col items-start justify-center rounded-md border px-3 text-left text-sm font-medium ${editingProfile === profile ? 'border-slate-800 bg-slate-100 text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
								on:click={() => { editingProfile = profile as ProfileId; message = ''; }}
							>
								{label}
								<span class="text-xs font-normal text-slate-500">{profileCounts[profile] ?? 0} belmomenten</span>
							</button>
						{/each}
					</div>
					{#if editingEntries.length}
						<p class="text-sm text-slate-600">
							{editingEntries.length} belmomenten · {editingEntries[0].time}–{editingEntries[editingEntries.length - 1].time}
							{#if draftConfig.weekdays.length === 5} · Maandag t/m vrijdag{/if}
						</p>
					{/if}

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<fieldset class="min-w-0">
							<legend class="mb-1 text-sm font-semibold text-slate-800">Dagen waarop de bel gaat</legend>
							<div class="flex flex-wrap gap-2">
								{#each weekdays as day}
									<label class={`flex min-h-11 min-w-14 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium ${draftConfig.weekdays.includes(day.value) ? 'border-slate-700 bg-slate-100 text-slate-900' : 'border-slate-300 text-slate-600'}`}>
										<input
											type="checkbox"
											checked={draftConfig.weekdays.includes(day.value)}
											disabled={draftConfig.weekdays.includes(day.value) && draftConfig.weekdays.length === 1}
											on:change={() => toggleWeekday(day.value)}
											class="sr-only"
										/>
										{day.label}
									</label>
								{/each}
							</div>
						</fieldset>

						<label class="block text-sm font-semibold text-slate-800" for="bell-gap">
							Pauze tussen twee bellen
							<span class="mt-1 flex items-center gap-2 font-normal">
								<input
									id="bell-gap"
									class="min-h-10 w-24 rounded-md border border-slate-300 px-3 text-slate-900"
									type="number"
									min="0"
									max="30"
									step="1"
									value={draftConfig.gap_seconds}
									on:change={(event) => updateGap(event.currentTarget.value)}
								/>
								seconden
							</span>
							<span class="mt-1 block text-xs font-normal text-slate-500">Alleen gebruikt bij een beltijd met 2×.</span>
						</label>
					</div>

					<div class="flex items-end justify-between gap-3 border-t border-slate-200 pt-3">
						<div>
							<h4 class="text-base font-semibold text-slate-900">Beltijden</h4>
							<p class="text-sm text-slate-600">Pas het tijdstip aan, kies 1× of 2×, of verwijder het moment.</p>
						</div>
						<span class="shrink-0 text-sm text-slate-600">{editingEntries.length}</span>
					</div>
					{#if editingEntries.length}
						<div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
							{#each entryHours as hour}
								<fieldset class="min-w-0 rounded-md border border-slate-200 p-2">
									<legend class="px-1 text-sm font-semibold text-slate-700">{hour}:00 uur</legend>
									<div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
										{#each editingEntries as entry, index (index)}
											{#if entry.time.slice(0, 2) === hour}
												<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded bg-slate-50 px-2">
													<input
														class="min-h-11 min-w-0 rounded-md border-0 bg-transparent px-1 text-base font-medium text-slate-900 focus:outline-2 focus:outline-blue-600"
														type="time"
														aria-label={`Tijd ${index + 1}`}
														value={entry.time}
														on:change={(event) => updateTimeEntry(index, { time: event.currentTarget.value })}
													/>
													<select
														class="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
														aria-label={`Aantal bellen bij ${entry.time}`}
														value={entry.count}
														on:change={(event) => updateTimeEntry(index, { count: Number(event.currentTarget.value) === 2 ? 2 : 1 })}
													>
														<option value="1">1×</option>
														<option value="2">2×</option>
													</select>
													<button
														type="button"
														class="min-h-10 px-2 text-sm text-slate-600 hover:text-red-700 disabled:opacity-40"
														aria-label={`Verwijder tijd ${entry.time}`}
														disabled={busy || preview}
														on:click={() => setProfileEntries(editingEntries.filter((_, entryIndex) => entryIndex !== index))}
													>
														Verwijder
													</button>
												</div>
											{/if}
										{/each}
									</div>
								</fieldset>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-slate-600">Geen belmomenten in dit rooster.</p>
					{/if}
					<button type="button" disabled={busy || preview} on:click={addTimeEntry}>Tijd toevoegen</button>
				{:else}
					<p class="text-sm text-slate-600">Rooster laden…</p>
				{/if}

				<div class="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
					<button disabled={busy || preview || !draftConfig} on:click={save}>Opslaan</button>
					<button disabled={busy} on:click={() => refresh(true)}>Opnieuw laden</button>
					<button type="button" on:click={download}>Exporteren</button>
					<button disabled={busy || preview} on:click={() => { if (confirm('Vorig rooster herstellen?')) void mutate('restore', { revision }); }}>Herstellen</button>
					<label class="file-button">Importeren <input class="sr-only" type="file" accept="application/json,.json" on:change={importFile} /></label>
				</div>
			</div>
		{/if}
	{/if}
	{#if message}<p class="mt-2 text-sm" role="status">{message}</p>{/if}
</section>

<style>
	.bell-panel { border: 1px solid #cbd5e1; border-left: 4px solid #2563eb; border-radius: 0.8rem; background: #f8fafc; padding: 1rem; box-shadow: 0 2px 8px rgb(15 23 42 / 5%); }
	.bell-mark { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border-radius: 0.7rem; background: #dbeafe; color: #1d4ed8; font-size: 1.35rem; font-weight: 700; }
	.next-bell { border: 1px solid #bfdbfe; border-radius: 0.65rem; background: #eff6ff; padding: 0.45rem 0.7rem; }
	.mode-option { border-color: #cbd5e1; background: #fff; color: #334155; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease; }
	.mode-option:hover { border-color: #94a3b8; background: #f1f5f9; }
	.mode-option.selected { border-color: #3b82f6; background: #eff6ff; color: #1e3a8a; box-shadow: inset 0 0 0 1px #3b82f6, 0 1px 3px rgb(30 64 175 / 12%); }
	.mode-option.selected.paused { border-color: #64748b; background: #f1f5f9; color: #334155; box-shadow: inset 0 0 0 1px #64748b; }
	.mode-option input { accent-color: #2563eb; }
	.bell-actions { border: 1px solid #dbe3ed; background: #eef2f7; }
	button, .file-button { display: inline-flex; align-items: center; min-height: 48px; padding: 8px 14px; border: 1px solid #94a3b8; border-radius: 6px; background: white; color: #0f172a; cursor: pointer; }
	button.save-action { border-color: #1d4ed8; background: #1d4ed8; color: white; font-weight: 600; }
	button.demo-action { border-color: #94a3b8; background: #fff; color: #334155; }
	button.edit-action { border-color: #334155; background: #fff; color: #1e293b; font-weight: 600; }
	button.save-action:hover:not(:disabled) { background: #1e40af; }
	button.demo-action:hover:not(:disabled), button.edit-action:hover:not(:disabled) { background: #f8fafc; }
	button:disabled { opacity: .5; }
	.file-button:focus-within { outline: 2px solid #2563eb; outline-offset: 2px; }
	@media (max-width: 640px) { .bell-panel { padding: 0.75rem; } .next-bell { width: auto; } }
</style>
