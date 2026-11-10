<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Power from 'lucide-svelte/icons/power';
	import { SHELLY_ROOMS } from '../../../config/shelly';
	import type {
		ShellyBrowserView,
		ShellyRoomDevice,
		ShellyComponentView
	} from '$lib/dashboard/shelly-browser';
	export let active = true;
	const dispatch = createEventDispatcher<{ roomchange: boolean }>();
	let mounted = false,
		selectedRoom: string | null = null,
		loading = false;
	let snapshot: ShellyBrowserView | null = null,
		error = '',
		actionError = '';
	let pending = new Set<string>();
	let timer: ReturnType<typeof setInterval> | null = null;
	let controller: AbortController | null = null;
	const followups = new Map<ReturnType<typeof setTimeout>, () => void>();
	$: if (mounted) {
		if (active) start();
		else stop();
	}
	$: room = snapshot?.rooms.find((room) => room.id === selectedRoom);
	function cancelRead() {
		controller?.abort();
		controller = null;
		loading = false;
	}
	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
		cancelRead();
		for (const [timeout, resolve] of followups) {
			clearTimeout(timeout);
			resolve();
		}
		followups.clear();
		pending = new Set();
	}
	function start() {
		if (timer || document.hidden) return;
		void refresh();
		timer = setInterval(() => void refresh(), 30_000);
	}
	function visibility() {
		if (document.hidden) stop();
		else if (active) start();
	}
	async function refresh(force = false, roomId = selectedRoom): Promise<boolean> {
		if (!active || !mounted || document.hidden || controller) return false;
		const request = new AbortController();
		controller = request;
		const timeout = setTimeout(() => request.abort(), 15_000);
		loading = true;
		let failureMessage = 'Shelly-status is momenteel niet beschikbaar.';
		try {
			const query = new URLSearchParams();
			if (roomId) query.set('room', roomId);
			if (force) query.set('refresh', '1');
			const response = await fetch(`/api/shelly${query.size ? '?' + query : ''}`, {
				signal: request.signal
			});
			const result = await response.json();
			if (controller !== request) return false;
			if (!response.ok) {
				failureMessage = typeof result.message === 'string' ? result.message : failureMessage;
				throw new Error('Status unavailable');
			}
			if (selectedRoom === roomId) snapshot = result;
			error = '';
			return true;
		} catch (cause) {
			if (controller === request) error = failureMessage;
			return false;
		} finally {
			clearTimeout(timeout);
			if (controller === request) {
				controller = null;
				loading = false;
			}
		}
	}
	function chooseRoom(id: string | null) {
		cancelRead();
		if (snapshot) snapshot = { ...snapshot, devices: undefined, room: undefined };
		selectedRoom = id;
		actionError = '';
		error = '';
		dispatch('roomchange', id !== null);
		void refresh();
	}
	function waitForFollowup(delay: number) {
		return new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				followups.delete(timeout);
				resolve();
			}, delay);
			followups.set(timeout, resolve);
		});
	}
	async function command(
		device: ShellyRoomDevice,
		component: ShellyComponentView,
		command: 'on' | 'off'
	) {
		const key = `${device.id}:${component.id}`;
		if (pending.has(key) || !selectedRoom) return;
		const roomId = selectedRoom;
		pending = new Set([...pending, key]);
		actionError = '';
		try {
			const response = await fetch('/api/shelly', {
				method: 'POST',
				signal: AbortSignal.timeout(15_000),
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					room: selectedRoom,
					deviceId: device.id,
					component: component.id,
					command
				})
			});
			const result = await response.json();
			if (!response.ok)
				throw new Error(result.error ?? 'Opdracht mislukt. Controleer de werkelijke status.');
			if (active && mounted && !document.hidden) {
				await waitForFollowup(1500);
				if (active && mounted && !document.hidden) {
					cancelRead();
					await refresh(true, roomId);
				}
			}
		} catch (cause) {
			actionError =
				cause instanceof Error
					? cause.message
					: 'Opdracht mislukt. Controleer de werkelijke status.';
		} finally {
			pending = new Set([...pending].filter((value) => value !== key));
		}
	}
	onMount(() => {
		mounted = true;
		return () => {
			mounted = false;
			stop();
		};
	});
	onMount(() => {
		document.addEventListener('visibilitychange', visibility);
		return () => document.removeEventListener('visibilitychange', visibility);
	});
</script>

<div class="flex min-h-0 flex-1 flex-col" aria-label="Shelly ruimtes">
	<div class="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
		{#if selectedRoom}<button
				type="button"
				class="flex min-h-12 items-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700"
				on:click={() => chooseRoom(null)}
				><ArrowLeft size={20} /><span>Terug naar ruimtes</span></button
			>{:else}<p class="text-base text-slate-600">Kies een ruimte.</p>{/if}
		<button
			type="button"
			class="inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-50"
			disabled={loading}
			on:click={() => void refresh(true)}><RefreshCw size={18} /><span>Vernieuwen</span></button
		>
	</div>
	{#if error || snapshot?.stale}<p
			class="mb-4 border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-900"
			role="status"
		>
			{error || snapshot?.message}
		</p>{/if}
	{#if snapshot?.updatedAt}<p class="mb-3 text-xs text-slate-500">
			{snapshot.stale || error ? 'Laatst bekend' : 'Bijgewerkt'} om {new Date(
				snapshot.updatedAt
			).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
		</p>{/if}
	{#if actionError}<p
			class="mb-3 border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900"
			role="alert"
		>
			{actionError}
		</p>{/if}
	<div class="min-h-0 flex-1 overflow-y-auto pb-2">
		{#if !snapshot}<p class="py-6 text-slate-600">
				{loading ? 'Ruimtes laden…' : 'Ruimtes niet beschikbaar.'}
			</p>
		{:else if !selectedRoom}
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each SHELLY_ROOMS as configured (configured.id)}
					{@const entry = snapshot.rooms.find((room) => room.id === configured.id)}
					<button
						type="button"
						class="flex min-h-44 flex-col items-start justify-center gap-3 rounded-lg border border-slate-300 bg-white p-6 text-left hover:border-sky-500 hover:bg-sky-50 disabled:opacity-60"
						disabled={!entry?.found}
						on:click={() => chooseRoom(configured.id)}
					>
						<span class="text-2xl font-semibold text-slate-900">{configured.name}</span>
						<span class="text-sm text-slate-600"
							>{entry?.found
								? `${entry.count ?? 0} apparaten · ${snapshot.stale || error || entry.onlineCount === null ? 'Status onbekend' : `${entry.onlineCount} online`}`
								: 'Ruimte niet gevonden in Shelly-account'}</span
						>
					</button>
				{/each}
			</div>
		{:else}
			<h3 class="mb-4 text-xl font-semibold text-slate-900">{room?.name ?? 'Ruimte'}</h3>
			{#if loading && !snapshot.devices}<p class="py-6 text-slate-600">Apparaten laden…</p>
			{:else if !room?.found}<p class="py-6 text-slate-600">
					Ruimte niet gevonden in het Shelly-account.
				</p>
			{:else if !snapshot.devices?.length}<p class="py-6 text-slate-600">
					Geen apparaten in deze ruimte.
				</p>
			{:else}
				<div class="shelly-device-grid" aria-label="Shelly apparaten">
					{#each snapshot.devices as device (device.id)}
						<section class="shelly-device-card" aria-label={device.name}>
							<div class="min-w-0">
								<h4 class="text-base font-semibold break-words text-slate-900">{device.name}</h4>
								{#if device.online !== true}<p
										class={`mt-1 text-xs ${device.online === false ? 'font-semibold text-amber-800' : 'text-slate-500'}`}
									>
										{device.online === false ? 'Apparaat offline' : 'Bereikbaarheid onbekend'}
									</p>{/if}
								{#if !device.components.length}<p class="mt-1 text-sm text-slate-500">
										Status onbekend · geen ondersteunde uitgang of sensor.
									</p>{/if}
								{#each device.components as component (component.id)}
									<p
										class={`mt-1 text-sm ${component.output === true ? 'font-medium text-green-700' : 'text-slate-500'}`}
									>
										{#if device.components.length > 1}{component.label} ·
										{/if}<span
											>{component.output === true
												? 'Aan'
												: component.output === false
													? 'Uit'
													: (component.value ?? 'Status onbekend')}</span
										>
									</p>
								{/each}
							</div>
							<div class="flex shrink-0 flex-col items-end justify-center gap-2">
								{#each device.components.filter((component) => component.controllable) as component (component.id)}
									{#if component.output !== null}
										<button
											type="button"
											class={`shelly-power ${component.output ? 'shelly-power-on' : ''}`}
											aria-label={`${device.name} ${component.label}: ${component.output ? 'Uit' : 'Aan'}`}
											aria-pressed={component.output}
											aria-busy={pending.has(`${device.id}:${component.id}`)}
											title={component.output ? 'Uitschakelen' : 'Inschakelen'}
											disabled={pending.has(`${device.id}:${component.id}`) ||
												snapshot.stale ||
												Boolean(error)}
											on:click={() =>
												void command(device, component, component.output ? 'off' : 'on')}
										>
											<Power size={26} aria-hidden="true" />
											{#if pending.has(`${device.id}:${component.id}`)}<span
													class="sr-only"
													role="status">Opdracht wordt uitgevoerd</span
												>{/if}
										</button>
									{:else}
										<div
											class="flex gap-2"
											aria-label={`${device.name}: kies Aan of Uit`}
											aria-busy={pending.has(`${device.id}:${component.id}`)}
										>
											{#if pending.has(`${device.id}:${component.id}`)}<span
													class="sr-only"
													role="status">Bezig met uitvoeren</span
												>{/if}
											<button
												type="button"
												class="shelly-explicit"
												aria-label={`${device.name} ${component.label}: Aan`}
												aria-busy={pending.has(`${device.id}:${component.id}`)}
												disabled={pending.has(`${device.id}:${component.id}`) ||
													snapshot.stale ||
													Boolean(error)}
												on:click={() => void command(device, component, 'on')}>Aan</button
											>
											<button
												type="button"
												class="shelly-explicit"
												aria-label={`${device.name} ${component.label}: Uit`}
												aria-busy={pending.has(`${device.id}:${component.id}`)}
												disabled={pending.has(`${device.id}:${component.id}`) ||
													snapshot.stale ||
													Boolean(error)}
												on:click={() => void command(device, component, 'off')}>Uit</button
											>
										</div>
									{/if}
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.shelly-device-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.shelly-device-card {
		display: flex;
		min-width: 0;
		min-height: 104px;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: white;
	}
	.shelly-power {
		position: relative;
		display: inline-flex;
		width: 52px;
		height: 52px;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border: 1px solid #cbd5e1;
		border-radius: 50%;
		background: #f1f5f9;
		color: #475569;
	}
	.shelly-power-on {
		border-color: #15803d;
		background: #15803d;
		color: white;
	}
	.shelly-power[aria-busy='true']::after {
		position: absolute;
		inset: 2px;
		border: 2px solid transparent;
		border-top-color: currentColor;
		border-right-color: currentColor;
		border-radius: 9999px;
		content: '';
		animation: shelly-spin 0.8s linear infinite;
	}
	@keyframes shelly-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.shelly-explicit {
		min-width: 48px;
		min-height: 44px;
		padding: 6px 8px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: white;
		font-size: 0.875rem;
		font-weight: 600;
		color: #334155;
	}
	.shelly-power:disabled,
	.shelly-explicit:disabled {
		opacity: 0.5;
	}
	.shelly-power:focus-visible,
	.shelly-explicit:focus-visible {
		outline: 2px solid #0284c7;
		outline-offset: 3px;
	}
	@media (max-width: 700px) {
		.shelly-device-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
