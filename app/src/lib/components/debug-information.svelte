<script lang="ts">
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	export let activity: () => void;
	export let browserOnline: boolean;
	export let cloudAvailable: boolean | null;
	export let touchscreenConnected: boolean | null;
	export let wattageUpdatedAt: number | null;
	export let wattageStale: boolean;
	export let statusDeviceCount: number;
	type Diagnostics = {
		appVersion: string;
		buildCommit: string | null;
		localCommit: string | null;
		remoteCommit: string | null;
		remoteCheckedAt: number | null;
		remoteError: string | null;
		mode: string;
		host: {
			available: boolean;
			clock: string | null;
			uptimeSeconds: number | null;
			service: { activeState: string; subState: string; result: string } | null;
			error: string | null;
		};
	};
	const dispatch = createEventDispatcher<{ close: void }>();
	let data: Diagnostics | null = null;
	let loading = true;
	let error = '';
	let checkedAt: number | null = null;
	let dialog: HTMLDivElement;
	const controller = new AbortController();
	onMount(() => {
		const previous = document.activeElement as HTMLElement | null;
		dialog.focus();
		void refresh();
		return () => {
			controller.abort();
			previous?.focus();
		};
	});
	async function refresh() {
		activity();
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/diagnostics', {
				cache: 'no-store',
				signal: controller.signal
			});
			if (!response.ok) throw new Error('Versiegegevens konden niet worden opgehaald.');
			data = await response.json();
			checkedAt = Date.now();
		} catch {
			if (!controller.signal.aborted) error = 'Versiegegevens konden niet worden opgehaald.';
		} finally {
			loading = false;
		}
	}
	function date(value: number | string | null) {
		return value === null
			? 'Onbekend'
			: new Date(value).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
	}
	function uptime(seconds: number | null) {
		return seconds === null
			? 'Onbekend'
			: `${Math.floor(seconds / 3600)} uur ${Math.floor((seconds % 3600) / 60)} minuten`;
	}
	function keydown(event: KeyboardEvent) {
		activity();
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			dispatch('close');
		}
		if (event.key !== 'Tab') return;
		const items = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), summary, a[href]'
			)
		].filter((node) => node.getClientRects().length);
		const first = items[0],
			last = items.at(-1);
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
</script>

<div
	class="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/70 p-4 sm:p-6"
	role="presentation"
	on:pointerdown={activity}
	on:wheel|passive={activity}
	on:touchmove|passive={activity}
>
	<button
		type="button"
		class="fixed inset-0"
		aria-label="Debugvenster sluiten"
		on:click={() => dispatch('close')}
	></button>
	<div
		bind:this={dialog}
		class="relative mx-auto max-w-[1200px] rounded-lg border border-slate-300 bg-white p-5 text-slate-800 sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-labelledby="debug-information-title"
		tabindex="-1"
		on:keydown={keydown}
	>
		<header class="mb-4 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
			<h2 id="debug-information-title" class="text-xl font-semibold">
				Debug- en systeeminformatie
			</h2>
			<div class="flex gap-2">
				<button
					type="button"
					class="min-h-10 rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-100 disabled:opacity-50"
					disabled={loading}
					on:click={refresh}>{loading ? 'Lezen…' : 'Vernieuwen'}</button
				><button
					type="button"
					class="min-h-10 rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-100"
					on:click={() => dispatch('close')}>Sluiten</button
				>
			</div>
		</header>
		<p class="mb-4 text-sm text-slate-600">
			Maak bij een probleem een foto van dit scherm. Gegevens opgehaald: {date(checkedAt)}.
		</p>
		{#if error}<p class="mb-4 text-sm text-red-700" role="alert">{error}</p>{/if}
		<section class="mb-4 rounded-lg border border-slate-300 p-4" aria-label="Versie en verbinding">
			<div class="grid gap-x-6 gap-y-3 md:grid-cols-2">
				<dl class="space-y-2 text-sm">
					<div class="flex justify-between gap-4">
						<dt>Appversie</dt>
						<dd class="font-semibold">{data?.appVersion ?? 'Onbekend'}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Omgeving</dt>
						<dd>
							{data?.mode === 'mock'
								? 'Demo (hashes gesimuleerd)'
								: data?.mode === 'development-live'
									? 'Lokale ontwikkeling'
									: data
										? 'ODROID'
										: 'Onbekend'}
						</dd>
					</div>
					<div>
						<dt class="font-semibold">App build-commit</dt>
						<dd class="font-mono text-xs break-all">{data?.buildCommit ?? 'Onbekend'}</dd>
					</div>
					<div>
						<dt class="font-semibold">Lokale commit</dt>
						<dd class="font-mono text-xs break-all">{data?.localCommit ?? 'Onbekend'}</dd>
					</div>
					<div>
						<dt class="font-semibold">Laatste remote commit</dt>
						<dd class="font-mono text-xs break-all">{data?.remoteCommit ?? 'Onbekend'}</dd>
						<dd class="text-xs text-slate-500">
							Laatst gecontroleerd: {date(data?.remoteCheckedAt ?? null)}
						</dd>
						{#if data?.remoteError}<dd class="text-xs text-amber-700">{data.remoteError}</dd>{/if}
					</div>
				</dl>
				<dl class="space-y-2 text-sm">
					<div class="flex justify-between gap-4">
						<dt>Browserverbinding</dt>
						<dd>{browserOnline ? 'Online' : 'Offline'}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Shelly Cloud</dt>
						<dd>
							{cloudAvailable === null
								? 'Onbekend'
								: cloudAvailable
									? 'Bereikbaar'
									: 'Niet bereikbaar'}
						</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Touchscreen</dt>
						<dd>
							{touchscreenConnected === null
								? 'Onbekend'
								: touchscreenConnected
									? 'Aangesloten'
									: 'Niet gevonden'}
						</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Statusapparaten</dt>
						<dd>{statusDeviceCount}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Vermogen bijgewerkt</dt>
						<dd>{date(wattageUpdatedAt)}{wattageStale ? ' (oude gegevens)' : ''}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Hostonderhoud</dt>
						<dd>{data?.host.available ? 'Bereikbaar' : 'Niet beschikbaar'}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>ODROID-klok</dt>
						<dd>{date(data?.host.clock ?? null)}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>ODROID draait</dt>
						<dd>{uptime(data?.host.uptimeSeconds ?? null)}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Updateservice</dt>
						<dd>
							{data?.host.service
								? `${data.host.service.activeState} / ${data.host.service.result}`
								: 'Onbekend'}
						</dd>
					</div>
					{#if data?.host.error}<div class="text-xs text-amber-700">{data.host.error}</div>{/if}
				</dl>
			</div>
		</section>
		<slot />
	</div>
</div>
