<script lang="ts">
	import { onMount, tick } from 'svelte';
	import TimePicker from './time-picker.svelte';

	type Config = {
		paused: boolean;
		active_profile: string;
		weekdays: number[];
		gap_seconds: number;
		bell_duration_seconds: number;
		profiles: Record<string, Array<string | { time: string; count?: number }>>;
		timezone: string;
	};
	type ProfileId = 'regular' | 'short' | 'ten-minute';
	type TimeEntry = { time: string; count: 1 | 2 };
	type BellEvent = { at: string; profile: string; time: string; count?: number };

	let config: Config | null = null;
	let draftConfig: Config | null = null;
	let selectedMode = 'off';
	let editingProfile: ProfileId = 'regular';
	let editingEntries: TimeEntry[] = [];
	let revision = 0;
	let busy = false;
	let message = '';
	let status: Record<string, unknown> | null = null;
	let editing = false;
	let newBellTime = '';
	let newBellCount: 1 | 2 = 1;
	let openHours = new Set<string>();
	let preview = false;
	let connectionError = false;
	let retryAfter = 0;
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
		{ value: 4, label: 'Vr' },
		{ value: 5, label: 'Za' },
		{ value: 6, label: 'Zo' }
	];

	$: runningProfile =
		(status?.paused ?? config?.paused)
			? null
			: String(status?.active_profile ?? config?.active_profile ?? '');
	$: nextBell = status?.next_event as BellEvent | null;
	$: editingEntries = (draftConfig?.profiles?.[editingProfile] ?? []).map(parseTimeEntry);
	$: entryHours = Array.from(new Set(editingEntries.map((entry) => entry.time.slice(0, 2))));
	$: profileCounts = Object.fromEntries(
		Object.entries(draftConfig?.profiles ?? {}).map(([id, times]) => [id, times.length])
	);
	$: savedMode = config ? (config.paused ? 'off' : config.active_profile) : 'off';
	$: modeDirty = selectedMode !== savedMode;
	$: rosterDirty = Boolean(
		config &&
			draftConfig &&
			JSON.stringify([
				draftConfig.profiles,
				draftConfig.weekdays,
				draftConfig.gap_seconds,
				draftConfig.bell_duration_seconds
			]) !==
				JSON.stringify([
					config.profiles,
					config.weekdays,
					config.gap_seconds,
					config.bell_duration_seconds
				])
	);
	$: validNewTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(newBellTime);

	function nextBellLabel(event: BellEvent) {
		return (
			new Intl.DateTimeFormat('nl-NL', {
				weekday: 'short',
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'Europe/Amsterdam',
				hourCycle: 'h23'
			}).format(new Date(event.at)) + (event.count === 2 ? ' · 2×' : '')
		);
	}

	function weekdaySummary(days: number[]) {
		if (days.length === 7) return 'iedere dag';
		if ([0, 1, 2, 3, 4].every((day) => days.includes(day)) && days.length === 5)
			return 'maandag t/m vrijdag';
		return days
			.map((day) => weekdays.find((item) => item.value === day)?.label)
			.filter(Boolean)
			.join(', ');
	}

	function parseTimeEntry(value: string | { time: string; count?: number }): TimeEntry {
		if (typeof value !== 'string') return { time: value.time, count: value.count === 2 ? 2 : 1 };
		const match = /^(\d{2}:\d{2})(?:x([12]))?$/.exec(value);
		return { time: match?.[1] ?? '08:00', count: match?.[2] === '2' ? 2 : 1 };
	}

	function serializeTimeEntry(entry: TimeEntry) {
		return entry.count === 2 ? `${entry.time}x2` : entry.time;
	}

	function hourEntryCount(hour: string) {
		return editingEntries.filter((entry) => entry.time.slice(0, 2) === hour).length;
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

	async function addTimeEntry() {
		if (!validNewTime || editingEntries.length >= 200) return;
		if (editingEntries.some((entry) => entry.time === newBellTime)) {
			message = 'Deze tijd staat al in het rooster.';
			return;
		}
		const hour = newBellTime.slice(0, 2);
		setProfileEntries(
			[...editingEntries, { time: newBellTime, count: newBellCount }].sort((a, b) =>
				a.time.localeCompare(b.time)
			)
		);
		openHours = new Set([...openHours, hour]);
		newBellTime = '';
		await tick();
		document.getElementById(`bell-hour-${hour}`)?.scrollIntoView({ block: 'nearest' });
	}

	function setHourOpen(hour: string, open: boolean) {
		const next = new Set(openHours);
		if (open) next.add(hour);
		else next.delete(hour);
		openHours = next;
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
		if (Number.isFinite(gap) && gap >= 0 && gap <= 30) {
			draftConfig = { ...draftConfig, gap_seconds: Math.round(gap * 10) / 10 };
			message = '';
		}
	}

	function updateBellDuration(value: string) {
		if (!draftConfig) return;
		const duration = Number(value);
		if (Number.isFinite(duration) && duration >= 0.1 && duration <= 30) {
			draftConfig = { ...draftConfig, bell_duration_seconds: Math.round(duration * 10) / 10 };
			message = '';
		}
	}

	function requestId() {
		const bytes = crypto.getRandomValues(new Uint32Array(4));
		return Array.from(bytes, (part) => part.toString(16).padStart(8, '0')).join('');
	}

	async function read(operation: string) {
		const response = await fetch(`/api/bells/${operation}`);
		const result = await response.json();
		if (!response.ok)
			throw new Error(result.error ?? result.message ?? 'Belservice niet bereikbaar.');
		return result;
	}

	async function refresh(load = false) {
		try {
			status = await read('status');
			preview = status?.preview === true;
			if (message === 'Bel gestart.' && status?.last_outcome) message = '';
			if (load || !config) {
				const result = await read('config');
				const firstLoad = !config;
				const loadedConfig = result.config as Config;
				config = loadedConfig;
				draftConfig = JSON.parse(JSON.stringify(loadedConfig)) as Config;
				revision = result.revision;
				selectedMode = loadedConfig.paused ? 'off' : loadedConfig.active_profile;
				if (firstLoad && loadedConfig.active_profile in profileNames)
					editingProfile = loadedConfig.active_profile as ProfileId;
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
		busy = true;
		message = '';
		try {
			const response = await fetch(`/api/bells/${operation}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
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
		const blob = new Blob([JSON.stringify(draftConfig ?? config, null, 2)], {
			type: 'application/json'
		});
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
			if (imported.active_profile in profileNames)
				editingProfile = imported.active_profile as ProfileId;
			editing = true;
			message = 'Import geladen. Controleer het rooster en sla op.';
		} catch {
			message = 'Ongeldig roosterbestand.';
		}
	}

	onMount(() => {
		void refresh(true);
		const timer = setInterval(() => {
			if (!document.hidden && Date.now() >= retryAfter) void refresh();
		}, 3000);
		return () => {
			clearInterval(timer);
		};
	});
</script>

<section class="mb-4 border-b border-slate-200 pb-4" aria-labelledby="bell-manager-title">
	<div class="mb-2 flex min-h-11 items-start justify-between gap-2">
		<h3 id="bell-manager-title" class="text-base font-semibold text-slate-900">Schoolbel</h3>
		<div class="ml-auto w-52 shrink-0 text-right text-sm leading-5 sm:w-64">
			<div class="truncate text-slate-600">
				Volgende bel: {config?.paused ? 'Uit' : nextBell ? nextBellLabel(nextBell) : 'onbekend'}
			</div>
			<div class="h-5 truncate">
				{#if preview}
					<span class="text-slate-600">Lokaal voorbeeld</span>
				{/if}
			</div>
		</div>
	</div>

	{#if config}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Belrooster">
			{#each Object.entries(names) as [id, label]}
				<label
					class={`flex min-h-14 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-900 ${!busy && !preview ? '' : 'opacity-50'}`}
				>
					<input
						type="radio"
						name="bell-mode"
						value={id}
						checked={selectedMode === id}
						disabled={busy || preview}
						on:change={() => {
							selectedMode = id;
							message = '';
						}}
					/>
					{label}
				</label>
			{/each}
		</div>

		<div class="mt-2 flex flex-wrap items-center gap-2">
			<button
				class:save-dirty={modeDirty}
				disabled={busy || preview || !modeDirty}
				on:click={saveMode}>Opslaan</button
			>
			<button
				disabled={busy || preview}
				on:click={() => mutate('demo', { request_id: requestId(), count: 1 })}>Bel nu 1×</button
			>
			<button
				disabled={busy || preview}
				on:click={() => mutate('demo', { request_id: requestId(), count: 2 })}>Bel nu 2×</button
			>
			<button disabled={busy || preview} on:click={() => (editing = true)}
				>Rooster bewerken</button
			>
		</div>

		{#if editing}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
				role="presentation"
			>
				<div class="absolute inset-0 bg-white" aria-hidden="true"></div>
				<div
					class="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl"
					role="dialog"
					aria-modal="true"
					aria-labelledby="bell-editor-title"
					tabindex="-1"
					on:click|stopPropagation
					on:keydown|stopPropagation
				>
					<header
						class="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-6"
					>
						<div>
							<h2 id="bell-editor-title" class="text-xl font-semibold text-slate-900">
								Belrooster bewerken
							</h2>
							<p class="text-sm text-slate-600">
								Actief rooster: {runningProfile
									? (profileNames[runningProfile as ProfileId] ?? runningProfile)
									: 'Uit'}
							</p>
						</div>
						<button type="button" on:click={() => (editing = false)}>Sluiten</button>
					</header>
					<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
						<div class="space-y-3">
							{#if draftConfig}
								<div
									role="tablist"
									aria-label="Rooster kiezen"
									class="grid grid-cols-3 gap-2 border-b border-slate-200 pb-2"
								>
									{#each Object.entries(profileNames) as [profile, label]}
										<button
											type="button"
											role="tab"
											aria-selected={editingProfile === profile}
											class={`bell-schedule-tab relative -mb-px flex min-h-14 flex-col items-start justify-center rounded-t-md border px-3 text-left text-sm ${editingProfile === profile ? 'z-10 border-slate-300 border-b-white bg-white font-semibold text-slate-900' : 'border-transparent bg-slate-100 font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
											on:click={() => {
												editingProfile = profile as ProfileId;
												openHours = new Set();
												message = '';
											}}
										>
											{label}
											<span class="text-xs font-normal text-slate-500"
												>{profileCounts[profile] ?? 0} belmomenten</span
											>
											{#if runningProfile === profile}<span class="live-profile">Loopt nu</span
												>{/if}
										</button>
									{/each}
								</div>
								{#if editingEntries.length}
									<p class="text-sm text-slate-600">
										{editingEntries.length} belmomenten · {editingEntries[0].time}–{editingEntries[
											editingEntries.length - 1
										].time}
										· {weekdaySummary(draftConfig.weekdays)}
									</p>
								{/if}

								<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
									<fieldset class="min-w-0">
										<legend class="mb-1 text-sm font-semibold text-slate-800"
											>Dagen waarop de bel gaat</legend
										>
										<div class="flex flex-wrap gap-2">
											{#each weekdays as day}
												<label
													class={`flex min-h-11 min-w-14 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium ${draftConfig.weekdays.includes(day.value) ? 'border-slate-700 bg-slate-100 text-slate-900' : 'border-slate-300 text-slate-600'}`}
												>
													<input
														type="checkbox"
														checked={draftConfig.weekdays.includes(day.value)}
														disabled={draftConfig.weekdays.includes(day.value) &&
															draftConfig.weekdays.length === 1}
														on:change={() => toggleWeekday(day.value)}
														class="sr-only"
													/>
													{day.label}
												</label>
											{/each}
										</div>
									</fieldset>

									<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<label class="block text-sm font-semibold text-slate-800" for="bell-gap">
											Tussen eerste en tweede bel
											<span class="mt-1 flex items-center gap-1 font-normal">
												<button
													type="button"
													class="timing-step"
													aria-label="Kortere pauze"
													disabled={draftConfig.gap_seconds <= 0 || busy}
													on:click={() =>
														updateGap(String(Math.max(0, draftConfig!.gap_seconds - 0.1)))}>−</button
												>
												<input
													id="bell-gap"
													aria-label="Tussen eerste en tweede bel"
													class="min-h-10 w-16 rounded-md border border-slate-300 px-2 text-slate-900"
													type="number"
													min="0"
													max="30"
													step="0.1"
													value={draftConfig.gap_seconds.toFixed(2)}
													on:input={(event) => updateGap(event.currentTarget.value)}
												/>
												<button
													type="button"
													class="timing-step"
													aria-label="Langere pauze"
													disabled={draftConfig.gap_seconds >= 30 || busy}
													on:click={() =>
														updateGap(String(Math.min(30, draftConfig!.gap_seconds + 0.1)))}>+</button
												>
												seconden
											</span>
										</label>
										<div class="text-sm font-semibold text-slate-800">
											Duur per bel
											<span class="mt-1 flex items-center gap-1 font-normal">
												<button
													type="button"
													class="timing-step"
													aria-label="Kortere belduur"
													disabled={draftConfig.bell_duration_seconds <= 0.1 || busy}
													on:click={() =>
														updateBellDuration(
															String(Math.max(0.1, draftConfig!.bell_duration_seconds - 0.1))
														)}>−</button
												>
												<input
													class="min-h-10 w-16 rounded-md border border-slate-300 px-2 text-slate-900"
													type="number"
													min="0.1"
													max="30"
													step="0.1"
													value={draftConfig.bell_duration_seconds.toFixed(2)}
													on:input={(event) => updateBellDuration(event.currentTarget.value)}
													aria-label="Duur per bel"
												/>
												<button
													type="button"
													class="timing-step"
													aria-label="Langere belduur"
													disabled={draftConfig.bell_duration_seconds >= 30 || busy}
													on:click={() =>
														updateBellDuration(
															String(Math.min(30, draftConfig!.bell_duration_seconds + 0.1))
														)}>+</button
												>
												seconden
											</span>
										</div>
									</div>
								</div>

								<p class="text-sm text-slate-600">
									Dubbele bel: {draftConfig.bell_duration_seconds} s bel → {draftConfig.gap_seconds} s stilte → {draftConfig.bell_duration_seconds} s bel.
								</p>

								<div class="flex items-end justify-between gap-3 border-t border-slate-200 pt-3">
									<div>
										<h4 class="text-base font-semibold text-slate-900">Beltijden</h4>
										<p class="text-sm text-slate-600">
											Pas het tijdstip aan, kies 1× of 2×, of verwijder het moment.
										</p>
									</div>
									<span class="shrink-0 text-sm text-slate-600">{editingEntries.length}</span>
								</div>
								{#if editingEntries.length}
									<div class="grid grid-cols-1 gap-2">
										{#each entryHours as hour}
											<details
												id={`bell-hour-${hour}`}
												class="min-w-0 rounded-md border border-slate-200"
												open={openHours.has(hour)}
												on:toggle={(event) => setHourOpen(hour, event.currentTarget.open)}
											>
												<summary
													class="cursor-pointer px-3 py-3 text-sm font-semibold text-slate-700"
												>
													{hour}:00 uur
													<span class="ml-1 font-normal text-slate-500"
														>· {hourEntryCount(hour)} belmomenten</span
													>
												</summary>
												<div class="grid grid-cols-1 gap-1">
													{#each editingEntries as entry, index (index)}
														{#if entry.time.slice(0, 2) === hour}
															<div
																class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded bg-slate-50 px-2"
															>
																<TimePicker
																	value={entry.time}
																	label={`Tijd ${index + 1}`}
																	disabled={busy || preview}
																	on:change={({ detail }) =>
																		updateTimeEntry(index, { time: detail.value })}
																/>
																<select
																	class="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
																	aria-label={`Aantal bellen bij ${entry.time}`}
																	value={entry.count}
																	on:change={(event) =>
																		updateTimeEntry(index, {
																			count: Number(event.currentTarget.value) === 2 ? 2 : 1
																		})}
																>
																	<option value={1}>1×</option>
																	<option value={2}>2×</option>
																</select>
																<button
																	type="button"
																	class="min-h-10 px-2 text-sm text-slate-600 hover:text-red-700 disabled:opacity-40"
																	aria-label={`Verwijder tijd ${entry.time}`}
																	disabled={busy || preview}
																	on:click={() =>
																		setProfileEntries(
																			editingEntries.filter((_, entryIndex) => entryIndex !== index)
																		)}
																>
																	Verwijder
																</button>
															</div>
														{/if}
													{/each}
												</div>
											</details>
										{/each}
									</div>
								{:else}
									<p class="text-sm text-slate-600">Geen belmomenten in dit rooster.</p>
								{/if}
								<div class="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
									<div class="w-40">
										<TimePicker
											bind:value={newBellTime}
											label="Kies nieuwe beltijd"
											showLabel
											disabled={busy || preview}
										/>
									</div>
									<select
										class="min-h-12 rounded-md border border-slate-300 px-3"
										bind:value={newBellCount}
										aria-label="Aantal bellen voor nieuwe tijd"
										><option value={1}>1×</option><option value={2}>2×</option></select
									>
									<button
										type="button"
										disabled={busy || preview || !validNewTime}
										on:click={addTimeEntry}>Tijd toevoegen</button
									>
								</div>
							{:else}
								<p class="text-sm text-slate-600">Rooster laden…</p>
							{/if}

							{#if message}<p class="text-sm" role="status">{message}</p>{/if}
						</div>
					</div>
					<footer
						class="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 sm:px-6"
					>
						<button
							class:save-dirty={rosterDirty}
							disabled={busy || preview || !rosterDirty}
							on:click={save}>Opslaan{rosterDirty ? ' · wijzigingen' : ''}</button
						>
						<button disabled={busy} on:click={() => refresh(true)}>Opnieuw laden</button>
						<button type="button" on:click={download}>Exporteren</button>
						<button
							disabled={busy || preview}
							on:click={() => {
								if (confirm('Vorig rooster herstellen?')) void mutate('restore', { revision });
							}}>Herstellen</button
						>
						<label class="file-button"
							>Importeren <input
								class="sr-only"
								type="file"
								accept="application/json,.json"
								on:change={importFile}
							/></label
						>
					</footer>
				</div>
			</div>
		{/if}
	{/if}
	{#if message && !editing}<p class="mt-2 text-sm" role="status">{message}</p>{/if}
</section>

<style>
	button,
	.file-button {
		display: inline-flex;
		align-items: center;
		min-height: 48px;
		padding: 8px 14px;
		border: 1px solid #94a3b8;
		border-radius: 6px;
		background: white;
		color: #0f172a;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
	}
	button.timing-step {
		min-height: 40px;
		min-width: 40px;
		padding: 4px;
		justify-content: center;
	}
	button.bell-schedule-tab {
		border-radius: 0.5rem 0.5rem 0 0;
		background: #f1f5f9;
		border-color: #cbd5e1;
	}
	button.bell-schedule-tab[aria-selected='true'] {
		background: #0284c7;
		color: white;
		border-color: #0284c7;
	}
	button.bell-schedule-tab[aria-selected='true'] span {
		color: white;
	}
	.live-profile {
		font-size: 0.75rem;
		font-weight: 700;
	}
	button.save-dirty {
		background: #0284c7;
		border-color: #0369a1;
		color: white;
		font-weight: 700;
	}
	.file-button:focus-within {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
	}
</style>
