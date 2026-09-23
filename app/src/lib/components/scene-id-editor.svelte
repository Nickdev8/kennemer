<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { DashboardControl } from '$lib/config/schema';
	import {
		sceneIdSchema,
		statusDeviceIdSchema,
		type SceneEditorEntry,
		type SceneSlot
	} from '$lib/config/scene-config-schema';

	type SceneConfigResponse = {
		ok?: boolean;
		editable?: boolean;
		controls?: DashboardControl[];
		entries?: SceneEditorEntry[];
		revision?: string;
		error?: string;
	};

	const dispatch = createEventDispatcher<{
		controls: DashboardControl[];
		close: void;
	}>();
	let entries: SceneEditorEntry[] = [];
	let originalValues: Record<string, string> = {};
	let values: Record<string, string> = {};
	let revision = '';
	let editPin = '';
	let editable = false;
	let loadingConfig = true;
	let saving = false;
	let errorMessage = '';
	let successMessage = '';
	let showPinPrompt = false;
	let pendingOperation: 'save' | 'reset' | null = null;
	let pendingChanges: Array<{ controlId: string; slot: SceneSlot; sceneId: string }> = [];

	$: groups = [
		{ key: 'main', label: 'Hoofdknoppen' },
		{ key: 'advanced', label: 'Geavanceerde knoppen' },
		{ key: 'energy', label: 'Losse acties' }
	].map((group) => ({
		...group,
		entries: entries.filter((entry) => entry.placement === group.key)
	}));
	$: changedCount = Object.keys(values).filter((key) => values[key] !== originalValues[key]).length;

	onMount(() => {
		void loadConfig();
	});

	function fieldKey(controlId: string, slot: SceneSlot) {
		return `${controlId}:${slot}`;
	}

	function slotLabel(slot: SceneSlot) {
		if (slot === 'status') return 'Status-ID';
		if (slot === 'scene') return 'Scène';
		return slot;
	}

	function hydrate(payload: SceneConfigResponse) {
		entries = payload.entries ?? [];
		revision = payload.revision ?? '';
		editable = payload.editable === true;
		const next: Record<string, string> = {};
		for (const entry of entries) {
			for (const [slot, value] of Object.entries(entry.slots)) {
				next[fieldKey(entry.controlId, slot as SceneSlot)] = value ?? '';
			}
		}
		values = next;
		originalValues = { ...next };
	}

	async function loadConfig() {
		loadingConfig = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/config/scenes', { cache: 'no-store' });
			const payload = (await response.json().catch(() => ({}))) as SceneConfigResponse;
			if (!response.ok || payload.ok === false) throw new Error(payload.error ?? 'Configuratie kon niet worden gelezen.');
			hydrate(payload);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Configuratie kon niet worden gelezen.';
		} finally {
			loadingConfig = false;
		}
	}

	function updateValue(key: string, event: Event) {
		values = { ...values, [key]: (event.currentTarget as HTMLInputElement).value };
		successMessage = '';
	}

	function resetValue(key: string) {
		values = { ...values, [key]: originalValues[key] ?? '' };
	}

	function collectChanges() {
		return Object.entries(values)
			.filter(([key, value]) => value !== originalValues[key])
			.map(([key, sceneId]) => {
				const separator = key.lastIndexOf(':');
				return {
					controlId: key.slice(0, separator),
					slot: key.slice(separator + 1) as SceneSlot,
					sceneId
				};
			});
	}

	async function save() {
		errorMessage = '';
		successMessage = '';
		const changes = collectChanges();
		for (const change of changes) {
			const valid =
				change.slot === 'status'
					? statusDeviceIdSchema.safeParse(change.sceneId).success
					: sceneIdSchema.safeParse(change.sceneId).success;
			if (!valid) {
				errorMessage = 'Gebruik voor elke scène-ID alleen cijfers.';
				if (change.slot === 'status') {
					errorMessage = 'Gebruik een geldig Shelly statusdevice-ID.';
				}
				return;
			}
		}
		if (changes.length === 0) {
			successMessage = 'Geen wijzigingen.';
			return;
		}
		pendingChanges = changes;
		pendingOperation = 'save';
		showPinPrompt = true;
	}

	async function persistChanges(changes: Array<{ controlId: string; slot: SceneSlot; sceneId: string }>) {
		saving = true;
		try {
			const response = await fetch('/api/config/scenes', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-kennemer-config-pin': editPin
				},
				body: JSON.stringify({ revision, changes })
			});
			const payload = (await response.json().catch(() => ({}))) as SceneConfigResponse;
			if (!response.ok || payload.ok === false) throw new Error(payload.error ?? 'Opslaan mislukt.');
			hydrate(payload);
			if (payload.controls) dispatch('controls', payload.controls);
			successMessage = 'Scène-ID wijzigingen opgeslagen.';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Opslaan mislukt.';
			if (errorMessage.includes('intussen gewijzigd')) await loadConfig();
		} finally {
			saving = false;
			editPin = '';
		}
	}

	async function resetAll() {
		errorMessage = '';
		successMessage = '';
		pendingOperation = 'reset';
		pendingChanges = [];
		showPinPrompt = true;
	}

	async function persistReset() {
		saving = true;
		try {
			const response = await fetch('/api/config/scenes/reset', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-kennemer-config-pin': editPin
				},
				body: JSON.stringify({ revision })
			});
			const payload = (await response.json().catch(() => ({}))) as SceneConfigResponse;
			if (!response.ok || payload.ok === false) throw new Error(payload.error ?? 'Resetten mislukt.');
			hydrate(payload);
			if (payload.controls) dispatch('controls', payload.controls);
			successMessage = 'Alle scène-ID wijzigingen teruggezet.';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Resetten mislukt.';
		} finally {
			saving = false;
			editPin = '';
		}
	}

	async function submitPin() {
		if (!editPin.trim()) {
			errorMessage = 'Vul de configuratie-PIN in.';
			return;
		}
		if (pendingOperation === 'save') {
			const controlCount = pendingChanges.length;
			const noun = controlCount === 1 ? 'bedieningselement' : 'bedieningselementen';
			const sceneLabel = controlCount === 1 ? 'scène-ID' : "scène-ID's";
			if (
				!window.confirm(
					`Weet je zeker dat je de ${sceneLabel} van ${controlCount} ${noun} wilt wijzigen?`
				)
			)
				return;
			showPinPrompt = false;
			await persistChanges(pendingChanges);
		} else if (pendingOperation === 'reset') {
			if (!window.confirm('Alle scène-ID wijzigingen terugzetten naar de codeconfiguratie?')) return;
			showPinPrompt = false;
			await persistReset();
		}
		pendingOperation = null;
	}

	function closeEditor() {
		if (saving) return;
		showPinPrompt = false;
		pendingOperation = null;
		dispatch('close');
	}
</script>

	<div
	class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 px-4 py-8"
	role="presentation"
	tabindex="-1"
>
	<button
		type="button"
		class="absolute inset-0 cursor-default"
		aria-label="Sluiten"
		on:click={closeEditor}
	></button>
	<div
		class="relative w-full max-w-4xl rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="scene-id-editor-title"
		tabindex="-1"
		on:click|stopPropagation
		on:keydown|stopPropagation
	>
	<div class="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
		<div>
			<h2 id="scene-id-editor-title" class="text-lg font-semibold text-slate-900">Scène-ID's beheren</h2>
			<p class="mt-1 text-sm text-slate-600">Pas alleen de gekoppelde Shelly-scène aan.</p>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-sm text-slate-500">{changedCount} gewijzigd</span>
			<button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" on:click={closeEditor}>
				Sluiten
			</button>
		</div>
	</div>

	{#if loadingConfig}
		<p class="mt-4 text-sm text-slate-500">Configuratie lezen…</p>
	{:else if !editable}
		<p class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
			Bewerken is uitgeschakeld. Stel KENNEMER_CONFIG_EDIT_PIN in op de server.
		</p>
	{:else}
		<div class="mt-4 space-y-5">
			{#each groups as group (group.key)}
				{#if group.entries.length > 0}
					<div>
						<h4 class="mb-2 text-sm font-semibold text-slate-700">{group.label}</h4>
						<div class="space-y-2">
							{#each group.entries as entry (entry.controlId)}
								<div class="rounded-lg border border-slate-200 p-3">
									<p class="text-sm font-semibold text-slate-800">{entry.label}</p>
									<div class="mt-2 space-y-2">
										{#each Object.entries(entry.slots) as [slot, baseValue] (slot)}
											{@const key = fieldKey(entry.controlId, slot as SceneSlot)}
											<label class="flex items-center gap-2">
								<span class="w-20 shrink-0 text-xs font-semibold text-slate-500">{slotLabel(slot as SceneSlot)}</span>
												<input
													class="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-sm"
													value={values[key] ?? baseValue}
													on:input={(event) => updateValue(key, event)}
													inputmode="numeric"
													aria-label={`${entry.label} ${slot}`}
												/>
												<button type="button" class="text-xs font-semibold text-slate-500 hover:text-slate-800" on:click={() => resetValue(key)}>
													Reset
												</button>
											</label>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
			<div class="flex flex-wrap gap-2">
				<button type="button" class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" on:click={save} disabled={saving}>
					{saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
				</button>
				<button type="button" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60" on:click={resetAll} disabled={saving}>
					Alles terugzetten
				</button>
			</div>
		</div>
	{/if}

	{#if errorMessage}
		<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{errorMessage}</p>
	{/if}
	{#if successMessage}
		<p class="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{successMessage}</p>
	{/if}
	</div>

	{#if showPinPrompt}
		<div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 px-4" role="presentation">
			<button type="button" class="absolute inset-0 cursor-default" aria-label="Annuleren" on:click={() => (showPinPrompt = false)}></button>
			<div class="relative w-full max-w-sm rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.12)]" role="dialog" aria-modal="true" aria-labelledby="scene-id-pin-title" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
				<h3 id="scene-id-pin-title" class="text-lg font-semibold text-slate-900">Configuratie-PIN</h3>
				<p class="mt-1 text-sm text-slate-600">Vul de PIN in om deze wijziging op te slaan.</p>
				<input class="mt-4 w-full rounded border border-slate-300 px-3 py-2 font-mono" type="password" bind:value={editPin} autocomplete="off" on:keydown={(event) => event.key === 'Enter' && submitPin()} />
				<div class="mt-4 flex justify-end gap-2">
					<button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" on:click={() => (showPinPrompt = false)} disabled={saving}>Annuleren</button>
					<button type="button" class="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60" on:click={submitPin} disabled={saving}>Doorgaan</button>
				</div>
			</div>
		</div>
	{/if}
</div>
