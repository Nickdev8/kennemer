<script lang="ts">
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { resolveControlColor } from './control-colors';
	import type { DashboardControl, DashboardTab } from '$lib/config/schema';
	import {
		configurationSnapshotSchema,
		controlOverrideSchema,
		type ConfigurationSnapshot,
		type ControlOverride,
		type SceneEditorEntry,
		type SceneSlot
	} from '$lib/config/scene-config-schema';

	type ConfigResponse = {
		ok?: boolean;
		editable?: boolean;
		controls?: DashboardControl[];
		tabs?: DashboardTab[];
		defaultTabs?: DashboardTab[];
		entries?: SceneEditorEntry[];
		revision?: string;
		canRestore?: boolean;
		snapshot?: ConfigurationSnapshot;
		error?: string;
		conflict?: boolean;
	};
	export let activity: () => void = () => {};
	const dispatch = createEventDispatcher<{
		controls: DashboardControl[];
		configuration: { controls: DashboardControl[]; tabs: DashboardTab[]; preview: boolean };
		close: void;
	}>();
	let entries: SceneEditorEntry[] = [];
	let values: Record<string, string> = {};
	let originalValues: Record<string, string> = {};
	let metadata: Record<string, ControlOverride> = {};
	let originalMetadata: Record<string, ControlOverride> = {};
	let tabs: DashboardTab[] = [];
	let originalTabs: DashboardTab[] = [];
	let savedSnapshot: ConfigurationSnapshot | null = null;
	let importedSnapshot: ConfigurationSnapshot | null = null;
	let revision = '';
	let editable = false;
	let canRestore = false;
	let loading = true;
	let saving = false;
	let conflict = false;
	let errorMessage = '';
	let successMessage = '';
	let importText = '';
	let editPin = '';
	let pendingOperation: 'save' | 'reset' | 'restore' | 'bell-relays' | null = null;
	let bellRelayIds: string[] = [];
	let originalBellRelayIds: string[] = [];
	let bellRevision = 0;
	let bellRelaysEditable = false;
	$: bellRelaysDirty = JSON.stringify(bellRelayIds) !== JSON.stringify(originalBellRelayIds);
	$: bellRelayIdsValid =
		bellRelayIds.length === 2 &&
		bellRelayIds.every((id) => /^[0-9a-f]{12}$/i.test(id)) &&
		bellRelayIds[0] !== bellRelayIds[1];
	let dialog: HTMLDivElement;
	let pinForm: HTMLFormElement;

	$: changes = Object.entries(values)
		.filter(([key, value]) => value !== originalValues[key])
		.map(([key, sceneId]) => {
			const split = key.lastIndexOf(':');
			return { controlId: key.slice(0, split), slot: key.slice(split + 1) as SceneSlot, sceneId };
		});
	$: metadataChanges = Object.entries(metadata)
		.filter(([id, value]) => JSON.stringify(value) !== JSON.stringify(originalMetadata[id]))
		.map(([controlId, values]) => ({ controlId, values }));
	$: tabsChanged = JSON.stringify(tabs) !== JSON.stringify(originalTabs);
	$: dirty = Boolean(changes.length || metadataChanges.length || tabsChanged || importedSnapshot);

	onMount(() => {
		const previousFocus = document.activeElement as HTMLElement | null;
		dialog.focus();
		void load();
		return () => previousFocus?.focus();
	});
	function handleKeydown(event: KeyboardEvent) {
		activity();
		if (event.key === 'Escape') {
			event.preventDefault();
			if (pendingOperation) {
				pendingOperation = null;
				editPin = '';
			} else close();
		}
		if (event.key !== 'Tab') return;
		const focusable = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary'
			)
		].filter((element) => element.getClientRects().length > 0);
		const first = focusable[0],
			last = focusable.at(-1);
		if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
			event.preventDefault();
			last?.focus();
		} else if (
			!event.shiftKey &&
			(document.activeElement === last || document.activeElement === dialog)
		) {
			event.preventDefault();
			first?.focus();
		}
	}
	async function loadBellRelays() {
		try {
			const response = await fetch('/api/bells/config', { cache: 'no-store' });
			if (!response.ok) return;
			const payload = await response.json();
			bellRelayIds = (payload.config.relays ?? []).map((relay: { id: string }) => relay.id);
			originalBellRelayIds = [...bellRelayIds];
			bellRevision = payload.revision;
			bellRelaysEditable = !payload.preview;
		} catch {
			bellRelaysEditable = false;
		}
	}
	function key(id: string, slot: string) {
		return `${id}:${slot}`;
	}
	function slotLabel(slot: string) {
		return (
			(
				{ on: 'Scène Aan', off: 'Scène Uit', scene: 'Scène', status: 'Shelly-status-ID' } as Record<
					string,
					string
				>
			)[slot] ?? slot
		);
	}
	function hydrate(payload: ConfigResponse) {
		entries = payload.entries ?? [];
		revision = payload.revision ?? '';
		editable = payload.editable === true;
		canRestore = payload.canRestore === true;
		tabs = structuredClone(payload.tabs ?? []);
		originalTabs = structuredClone(tabs);
		values = Object.fromEntries(
			entries.flatMap((entry) =>
				Object.entries(entry.slots).map(([slot, value]) => [
					key(entry.controlId, slot),
					value ?? ''
				])
			)
		);
		originalValues = { ...values };
		metadata = Object.fromEntries(
			entries.map((entry) => [entry.controlId, structuredClone(entry.metadata)])
		);
		originalMetadata = structuredClone(metadata);
		savedSnapshot = payload.snapshot ?? null;
		importedSnapshot = null;
		conflict = false;
		pendingOperation = null;
	}
	async function load() {
		loading = true;
		try {
			const response = await fetch('/api/config/scenes', { cache: 'no-store' });
			const payload = (await response.json()) as ConfigResponse;
			if (!response.ok || !payload.ok)
				throw new Error(payload.error ?? 'Configuratie kon niet worden gelezen.');
			hydrate(payload);
			await loadBellRelays();
			errorMessage = '';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Configuratie kon niet worden gelezen.';
		} finally {
			loading = false;
		}
	}
	function field(id: string, name: keyof ControlOverride, value: unknown) {
		metadata = { ...metadata, [id]: { ...metadata[id], [name]: value } };
		successMessage = '';
	}
	function inputValue(event: Event) {
		return (event.currentTarget as HTMLInputElement).value;
	}
	function resetControl(entry: SceneEditorEntry) {
		metadata = {
			...metadata,
			[entry.controlId]: structuredClone(entry.defaultMetadata)
		};
		values = {
			...values,
			...Object.fromEntries(
				Object.entries(entry.defaults).map(([slot, value]) => [
					key(entry.controlId, slot),
					value ?? ''
				])
			)
		};
	}
	function addTab() {
		let number = 1;
		while (tabs.some((tab) => tab.id === `tab-${number}`)) number++;
		tabs = [...tabs, { id: `tab-${number}`, label: `Tab ${number}`, order: tabs.length }];
	}
	function removeTab(id: string) {
		if (id === 'home') return;
		if (Object.values(metadata).some((value) => value.tabId === id)) {
			errorMessage = 'Verplaats eerst de knoppen op deze tab.';
			return;
		}
		tabs = tabs.filter((tab) => tab.id !== id).map((tab, order) => ({ ...tab, order }));
	}
	function moveTab(index: number, direction: number) {
		const target = index + direction;
		if (target < 0 || target >= tabs.length) return;
		const next = [...tabs];
		[next[index], next[target]] = [next[target], next[index]];
		tabs = next.map((tab, order) => ({ ...tab, order }));
	}
	function validateDraft() {
		for (const change of metadataChanges) {
			if (!controlOverrideSchema.safeParse(change.values).success)
				throw new Error('Controleer labels, posities en tijdsduren.');
		}
		configurationSnapshotSchema.parse({ version: 2, overrides: {}, metadata: {}, tabs });
	}
	async function requestOperation(operation: 'save' | 'reset' | 'restore' | 'bell-relays') {
		errorMessage = '';
		successMessage = '';
		try {
			if (operation === 'save') {
				if (!dirty) {
					successMessage = 'Geen wijzigingen.';
					return;
				}
				validateDraft();
			}
			pendingOperation = operation;
			await tick();
			pinForm?.scrollIntoView({ block: 'nearest' });
			pinForm?.querySelector('input')?.focus();
		} catch (error) {
			errorMessage =
				error instanceof Error && !('issues' in error)
					? error.message
					: 'Controleer de configuratie.';
		}
	}
	async function submit() {
		if (!pendingOperation || saving) return;
		if (!editPin.trim()) {
			errorMessage = 'Vul de configuratie-PIN in.';
			return;
		}
		const operation = pendingOperation;
		saving = true;
		try {
			if (operation === 'bell-relays') {
				const response = await fetch('/api/bells/relays', {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-kennemer-config-pin': editPin },
					body: JSON.stringify({ revision: bellRevision, relayIds: bellRelayIds })
				});
				const payload = await response.json();
				if (!response.ok) throw new Error(payload.error ?? 'Belrelais opslaan mislukt.');
				await loadBellRelays();
				successMessage = 'Belrelais opgeslagen.';
				return;
			}
			const suffix = operation === 'save' ? '' : `/${operation}`;
			const body =
				operation !== 'save'
					? { revision }
					: importedSnapshot
						? { revision, importSnapshot: importedSnapshot }
						: { revision, changes, metadata: metadataChanges, ...(tabsChanged ? { tabs } : {}) };
			const response = await fetch(`/api/config/scenes${suffix}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-kennemer-config-pin': editPin },
				body: JSON.stringify(body)
			});
			const payload = (await response.json()) as ConfigResponse;
			if (!response.ok || !payload.ok) {
				conflict = response.status === 409;
				throw new Error(payload.error ?? 'Opslaan mislukt.');
			}
			hydrate(payload);
			if (payload.controls) dispatch('controls', payload.controls);
			if (payload.controls && payload.tabs)
				dispatch('configuration', {
					controls: payload.controls,
					tabs: payload.tabs,
					preview: false
				});
			successMessage =
				operation === 'restore'
					? 'Vorige configuratie hersteld.'
					: operation === 'reset'
						? 'Standaardconfiguratie hersteld.'
						: 'Configuratie opgeslagen.';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Opslaan mislukt.';
		} finally {
			saving = false;
			editPin = '';
			pendingOperation = null;
		}
	}
	function exportSaved() {
		if (!savedSnapshot) return;
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(savedSnapshot, null, 2)], { type: 'application/json' })
		);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'kennemer-configuratie.json';
		anchor.click();
		URL.revokeObjectURL(url);
	}
	function stageImport() {
		try {
			importedSnapshot = configurationSnapshotSchema.parse(JSON.parse(importText));
			errorMessage = '';
			successMessage = 'Import klaar voor controle. Opslaan vereist de configuratie-PIN.';
		} catch {
			errorMessage = 'Ongeldig configuratiebestand. Gebruik een Kennemer-export van versie 2.';
		}
	}
	async function importFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		if (file.size > 200_000) {
			errorMessage = 'Configuratiebestand is te groot.';
			return;
		}
		try {
			importText = await file.text();
			stageImport();
		} catch {
			errorMessage = 'Configuratiebestand kon niet worden gelezen.';
		}
	}
	function close() {
		if (saving || (dirty && !window.confirm('Niet-opgeslagen wijzigingen verwijderen?'))) return;
		dispatch('close');
	}
	async function reload() {
		if (dirty && !window.confirm('Concept verwijderen en de actuele configuratie laden?')) return;
		await load();
	}
</script>

<div
	class="editor-overlay"
	role="presentation"
	on:pointerdown={activity}
	on:wheel|passive={activity}
	on:touchmove|passive={activity}
>
	<button type="button" class="editor-backdrop" aria-label="Sluiten" on:click={close}></button>
	<div
		bind:this={dialog}
		on:keydown={handleKeydown}
		class="editor"
		role="dialog"
		aria-modal="true"
		aria-labelledby="config-editor-title"
		tabindex="-1"
	>
		<header>
			<h2 id="config-editor-title">Bediening en tabs beheren</h2>
			<button type="button" on:click={close} disabled={saving}>Sluiten</button>
		</header>
		<div class="editor-body">
			{#if loading}<p>Configuratie lezen…</p>
			{:else if !editable}<p>Bewerken is niet ingeschakeld.</p>
			{:else}
				<p>Wijzigingen worden pas actief na opslaan. Opslaan schakelt geen apparaten.</p>
				{#if importedSnapshot}
					<h3>Import controleren</h3>
					<p>Deze import vervangt alle opgeslagen wijzigingen, inclusief tabs.</p>
					<pre>{JSON.stringify(importedSnapshot, null, 2)}</pre>
					<button
						type="button"
						on:click={() => {
							importedSnapshot = null;
						}}>Import annuleren</button
					>
				{:else}
					{#if bellRelayIds.length === 2}
						<h3>Schoolbel relais</h3>
						<div class="tab-row">
							{#each bellRelayIds as id, index}
								<label
									>Belrelais {index + 1} · Shelly-ID<input
										value={id}
										maxlength="12"
										disabled={saving || !bellRelaysEditable}
										on:input={(event) => {
											bellRelayIds = bellRelayIds.map((value, position) =>
												position === index ? inputValue(event).trim().toLowerCase() : value
											);
										}}
									/></label
								>
							{/each}
						</div>
						<button
							type="button"
							class="primary"
							disabled={saving || !bellRelaysEditable || !bellRelaysDirty || !bellRelayIdsValid}
							on:click={() => requestOperation('bell-relays')}>Belrelais opslaan</button
						>
					{/if}
					<h3>Tabs</h3>
					{#each tabs as tab, index (tab.id)}
						<div class="tab-row">
							<label
								>Naam<input
									value={tab.label}
									maxlength="80"
									on:input={(event) => {
										tabs = tabs.map((value) =>
											value.id === tab.id ? { ...value, label: inputValue(event) } : value
										);
									}}
								/></label
							>
							<button
								type="button"
								aria-label={`${tab.label} omhoog`}
								on:click={() => moveTab(index, -1)}
								disabled={index === 0}>↑</button
							>
							<button
								type="button"
								aria-label={`${tab.label} omlaag`}
								on:click={() => moveTab(index, 1)}
								disabled={index === tabs.length - 1}>↓</button
							>
							<button type="button" on:click={() => removeTab(tab.id)} disabled={tab.id === 'home'}
								>Verwijderen</button
							>
						</div>
					{/each}
					<button type="button" on:click={addTab} disabled={tabs.length >= 30}>Tab toevoegen</button
					>
					<h3>Concept bewerken</h3>
					<div class="control-table" role="region" aria-label="Knoppen bewerken">
						<table>
							<thead
								><tr
									><th scope="col">Knop</th><th scope="col">Tab / positie</th><th scope="col"
										>Ingeschakeld</th
									><th scope="col">Kleuren</th><th scope="col">Scènes / status</th><th scope="col"
										>Tijdsduur</th
									><th scope="col">Herstellen</th></tr
								></thead
							>
							<tbody>
								{#each entries as entry (entry.controlId)}
									<tr data-control-id={entry.controlId}>
										<td class="label-cell" data-label="Knop"
											><input
												aria-label={`Label ${entry.label}`}
												value={metadata[entry.controlId].label}
												maxlength="120"
												disabled={saving}
												on:input={(event) => field(entry.controlId, 'label', inputValue(event))}
											/></td
										>
										<td class="position-cell" data-label="Tab / positie">
											{#if entry.placement === 'main'}
												<label
													>Tab<select
														aria-label={`Tab ${entry.label}`}
														value={metadata[entry.controlId].tabId ?? 'home'}
														disabled={saving}
														on:change={(event) =>
															field(entry.controlId, 'tabId', inputValue(event))}
														>{#each tabs as tab (tab.id)}<option value={tab.id}>{tab.label}</option
															>{/each}</select
													></label
												>
												<label
													>Positie<input
														aria-label={`Positie ${entry.label}`}
														type="number"
														min="1"
														max="99"
														value={metadata[entry.controlId].pushNumber}
														disabled={saving}
														on:input={(event) =>
															field(entry.controlId, 'pushNumber', Number(inputValue(event)))}
													/></label
												>
											{:else if entry.placement === 'advanced'}
												<span>Geavanceerde bediening</span>
												<label
													>Positie<input
														aria-label={`Positie ${entry.label}`}
														type="number"
														min="1"
														max="99"
														value={metadata[entry.controlId].pushNumber}
														disabled={saving}
														on:input={(event) =>
															field(entry.controlId, 'pushNumber', Number(inputValue(event)))}
													/></label
												>
											{:else if entry.placement === 'energy'}<span>Losse actie</span>{/if}
										</td>
										<td class="enabled-cell" data-label="Ingeschakeld"
											><label class="checkbox"
												><input
													type="checkbox"
													aria-label={`Ingeschakeld ${entry.label}`}
													checked={metadata[entry.controlId].enabled !== false}
													disabled={saving}
													on:change={(event) =>
														field(
															entry.controlId,
															'enabled',
															(event.currentTarget as HTMLInputElement).checked
														)}
												/><span>{metadata[entry.controlId].enabled !== false ? 'Ja' : 'Nee'}</span
												></label
											></td
										>
										<td class="color-cell" data-label="Kleuren">
											{#each entry.controlType === 'device' ? ['onColor', 'offColor'] : ['color'] as colorField}
												{@const value =
													metadata[entry.controlId][colorField as keyof ControlOverride]}
												{@const color = resolveControlColor(
													typeof value === 'string' ? value : undefined
												)}
												<label class="color-field"
													>{colorField === 'onColor'
														? 'Aan'
														: colorField === 'offColor'
															? 'Uit'
															: 'Actie'}<span class="color-input"
														><span
															class="color-swatch"
															style:background-color={color?.background ?? '#f1f5f9'}
															aria-hidden="true"
														></span><input
															aria-label={`${colorField === 'onColor' ? 'Kleur Aan' : colorField === 'offColor' ? 'Kleur Uit' : 'Kleur'} ${entry.label}`}
															value={value ?? ''}
															placeholder="Standaard"
															disabled={saving}
															on:input={(event) =>
																field(
																	entry.controlId,
																	colorField as keyof ControlOverride,
																	inputValue(event).trim() || null
																)}
														/></span
													></label
												>
											{/each}
										</td>
										<td class="scene-cell" data-label="Scènes / status">
											{#each Object.keys(entry.slots) as slot (slot)}
												<label
													>{slot === 'on'
														? 'Aan'
														: slot === 'off'
															? 'Uit'
															: slot === 'status'
																? 'Status-ID'
																: 'Scène'}<input
														aria-label={`${slotLabel(slot)} ${entry.label}`}
														value={values[key(entry.controlId, slot)] ?? ''}
														inputmode={slot === 'status' ? 'text' : 'numeric'}
														placeholder="Niet ingesteld"
														disabled={saving}
														on:input={(event) => {
															values = {
																...values,
																[key(entry.controlId, slot)]: inputValue(event)
															};
															successMessage = '';
														}}
													/></label
												>
											{:else}<span>Geen scène-ID</span>{/each}
										</td>
										<td class="duration-cell" data-label="Tijdsduur">
											{#if 'activeDurationMs' in entry.metadata}<label
													>Seconden<input
														aria-label={`Tijdsduur ${entry.label}`}
														type="number"
														min="0.001"
														max="86400"
														step="0.001"
														value={metadata[entry.controlId].activeDurationMs
															? Number(metadata[entry.controlId].activeDurationMs) / 1000
															: ''}
														disabled={saving}
														on:input={(event) =>
															field(
																entry.controlId,
																'activeDurationMs',
																inputValue(event)
																	? Math.round(Number(inputValue(event)) * 1000)
																	: null
															)}
													/></label
												>{:else}<span>—</span>{/if}
										</td>
										<td class="reset-cell" data-label="Herstellen"
											><button
												type="button"
												aria-label={`Standaardwaarden ${entry.label}`}
												title={`Standaardlabel: ${entry.defaultMetadata.label}`}
												disabled={saving}
												on:click={() => resetControl(entry)}>Standaard</button
											></td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				<details>
					<summary>Configuratie importeren en exporteren</summary>
					<div class="transfer">
						<button type="button" on:click={exportSaved}>Opgeslagen configuratie exporteren</button
						><label
							>Configuratiebestand<input
								type="file"
								accept="application/json,.json"
								on:change={importFile}
							/></label
						><label>Of plak de JSON<textarea bind:value={importText} rows="5"></textarea></label
						><button type="button" on:click={stageImport}>Import controleren</button>
					</div>
				</details>
				{#if pendingOperation}
					<form bind:this={pinForm} class="pin" on:submit|preventDefault={submit}>
						<p>
							{pendingOperation === 'reset'
								? 'Alle instellingen terugzetten naar standaardwaarden?'
								: pendingOperation === 'restore'
									? 'De vorige opgeslagen configuratie herstellen?'
									: 'Deze configuratie opslaan?'}
						</p>
						<label
							>Configuratie-PIN<input
								type="password"
								bind:value={editPin}
								autocomplete="off"
							/></label
						>
						<div class="actions">
							<button class="primary" type="submit" disabled={saving}
								>{saving ? 'Opslaan…' : 'Bevestigen'}</button
							><button
								type="button"
								on:click={() => {
									pendingOperation = null;
									editPin = '';
								}}
								disabled={saving}>Annuleren</button
							>
						</div>
					</form>
				{/if}
			{/if}
			{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
			{#if successMessage}<p class="success" role="status">{successMessage}</p>{/if}
		</div>
		{#if !loading && editable}<footer class="editor-actions">
				<div class="actions">
					<button
						type="button"
						class="primary"
						on:click={() => requestOperation('save')}
						disabled={saving || !dirty || conflict}>Wijzigingen opslaan</button
					>
					<button type="button" on:click={reload} disabled={saving}>Concept verwijderen</button>
					<button
						type="button"
						on:click={() => requestOperation('restore')}
						disabled={saving || !canRestore || conflict}>Vorige opslag herstellen</button
					>
					<button
						type="button"
						on:click={() => requestOperation('reset')}
						disabled={saving || conflict}>Alles naar standaardwaarden</button
					>
				</div>
			</footer>{/if}
	</div>
</div>

<style>
	.editor-overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		padding: 16px;
		background: rgb(15 23 42 / 0.6);
	}
	.editor-backdrop {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
	}
	.editor {
		position: relative;
		margin: 0 auto;
		max-width: 1440px;
		width: 100%;
		max-height: calc(100dvh - 32px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: white;
		color: #0f172a;
	}
	header,
	.tab-row,
	.actions {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	header {
		justify-content: space-between;
		flex-shrink: 0;
		padding: 16px 20px;
		border-bottom: 1px solid #e2e8f0;
	}
	h2 {
		font-size: 20px;
		font-weight: 600;
	}
	h3 {
		margin: 24px 0 12px;
		font-size: 18px;
		font-weight: 600;
	}
	p {
		margin: 12px 0;
	}
	button,
	input,
	select,
	textarea {
		min-height: 48px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		padding: 10px 12px;
		font: inherit;
		background: white;
	}
	button {
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	button:hover:not(:disabled) {
		background: #f1f5f9;
	}
	button.primary {
		background: #1e293b;
		color: white;
	}
	label {
		display: flex;
		gap: 6px;
		min-width: 0;
		align-items: center;
	}
	input,
	select,
	textarea {
		width: 100%;
		min-width: 0;
	}
	.checkbox {
		min-height: 48px;
		white-space: nowrap;
		flex-direction: row;
		align-items: center;
	}
	.checkbox input {
		width: 24px;
		min-height: 24px;
	}
	.tab-row {
		margin-bottom: 12px;
		align-items: end;
	}
	.tab-row label {
		flex: 1;
		min-width: 160px;
	}
	details {
		margin: 12px 0;
		border-top: 1px solid #e2e8f0;
		padding-top: 12px;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		min-height: 48px;
		padding: 12px 0;
	}
	.actions {
		margin: 24px 0;
	}
	.transfer {
		display: grid;
		gap: 16px;
	}
	.pin {
		border-top: 1px solid #cbd5e1;
		margin-top: 16px;
		padding-top: 12px;
	}
	.error {
		color: #b91c1c;
	}
	.success {
		color: #166534;
	}
	.control-table {
		overflow-x: auto;
	}
	.label-cell {
		min-width: 170px;
	}
	.position-cell {
		min-width: 135px;
	}
	.color-cell {
		min-width: 160px;
	}
	.scene-cell {
		min-width: 195px;
	}
	.duration-cell {
		min-width: 105px;
	}

	.duration-cell > label {
		flex-direction: column;
		align-items: baseline;
	}
	td {
		vertical-align: top;
	}
	td label + label {
		margin-top: 8px;
	}
	.color-input {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.color-swatch {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		border: 1px solid #cbd5e1;
		border-radius: 3px;
	}
	pre {
		overflow: auto;
		max-height: 400px;
		padding: 12px;
		background: #f1f5f9;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: 8px;
		border-bottom: 1px solid #e2e8f0;
	}
	.editor-body {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 20px 16px;
	}
	.editor-actions {
		flex-shrink: 0;
		border-top: 1px solid #cbd5e1;
		background: #fff;
		padding: 12px 20px;
	}
	.editor-actions .actions {
		margin: 0;
	}
	@media (max-width: 1200px) {
		.control-table {
			overflow: visible;
		}
		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			overflow: hidden;
			clip-path: inset(50%);
		}
		table,
		tbody {
			display: block;
		}
		tr[data-control-id] {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 12px;
			margin: 12px 0;
			padding: 16px;
			border: 1px solid #cbd5e1;
			border-radius: 6px;
		}
		td {
			display: block;
			padding: 0;
			border: 0;
			min-width: 0 !important;
		}
		td::before {
			content: attr(data-label);
			display: block;
			margin-bottom: 8px;
			font-weight: 600;
			font-size: 13px;
		}
		.label-cell {
			grid-column: 1 / 3;
			grid-row: 1;
		}
		.enabled-cell {
			grid-column: 3;
			grid-row: 1;
		}
		.position-cell {
			grid-column: 1;
			grid-row: 2;
		}
		.color-cell {
			grid-column: 2;
			grid-row: 2;
		}
		.scene-cell {
			grid-column: 3;
			grid-row: 2;
		}
		.duration-cell {
			grid-column: 1;
			grid-row: 3;
		}
		.reset-cell {
			grid-column: 3;
			grid-row: 3;
		}
	}
	@media (max-width: 650px) {
		.editor-overlay {
			padding: 8px;
		}
		.editor {
			max-height: calc(100dvh - 16px);
		}
		header,
		.editor-actions {
			padding: 12px;
		}
		.editor-body {
			padding: 0 12px 12px;
		}
		h2 {
			font-size: 18px;
		}
		.tab-row {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto auto;
			gap: 8px;
		}
		.tab-row label {
			grid-column: 1 / -1;
			min-width: 0;
		}
		tr[data-control-id] {
			grid-template-columns: minmax(0, 1fr);
			padding: 12px;
		}
		td {
			grid-column: auto !important;
			grid-row: auto !important;
		}
		.editor-actions .actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}
		.editor-actions button {
			min-width: 0;
			padding: 8px;
			font-size: 13px;
		}
	}
</style>
