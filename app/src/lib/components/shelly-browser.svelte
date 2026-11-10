<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Power from 'lucide-svelte/icons/power';
	import type {
		ShellyBrowserView,
		ShellyRoomDevice,
		ShellyComponentView
	} from '$lib/dashboard/shelly-browser';
	export let active = true;
	export let includeOwnRoom = false;
	const dispatch = createEventDispatcher<{ own: 'modes' | 'devices' }>();
	let mounted = false,
		selectedRoom: string | null = null,
		loading = false;
	let snapshot: ShellyBrowserView | null = null,
		error = '',
		actionMessage = '';
	let pending = new Set<string>();
	let timer: ReturnType<typeof setInterval> | null = null;
	let controller: AbortController | null = null;
	const followups = new Set<ReturnType<typeof setTimeout>>();
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
		for (const timeout of followups) clearTimeout(timeout);
		followups.clear();
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
	async function refresh(force = false) {
		if (!active || !mounted || document.hidden || controller) return;
		const request = new AbortController();
		controller = request;
		const timeout = setTimeout(() => request.abort(), 15_000);
		loading = true;
		try {
			const query = new URLSearchParams();
			if (selectedRoom) query.set('room', selectedRoom);
			if (force) query.set('refresh', '1');
			const response = await fetch(`/api/shelly${query.size ? '?' + query : ''}`, {
				signal: request.signal
			});
			const result = await response.json();
			if (controller !== request) return;
			if (!response.ok) throw new Error('Shelly Cloud niet bereikbaar. Probeer later opnieuw.');
			snapshot = result;
			error = '';
		} catch (cause) {
			if (controller === request) error = 'Shelly Cloud niet bereikbaar. Probeer later opnieuw.';
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
		actionMessage = '';
		error = '';
		void refresh();
	}
	async function command(
		device: ShellyRoomDevice,
		component: ShellyComponentView,
		command: 'on' | 'off'
	) {
		const key = `${device.id}:${component.id}`;
		if (pending.has(key) || !selectedRoom) return;
		pending = new Set([...pending, key]);
		actionMessage = '';
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
			actionMessage = result.message;
			if (active && mounted)
				for (const delay of [1500, 5000]) {
					const timeout = setTimeout(() => {
						followups.delete(timeout);
						if (active && mounted) void refresh(true);
					}, delay);
					followups.add(timeout);
				}
		} catch (cause) {
			actionMessage =
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
	{#if actionMessage}<p
			class="mb-3 border-l-4 border-sky-600 bg-sky-50 px-4 py-3 text-sm text-slate-800"
			role="status"
		>
			{actionMessage}
		</p>{/if}
	<div class="min-h-0 flex-1 overflow-y-auto pb-2">
		{#if includeOwnRoom && !selectedRoom}
			<h3 class="mb-3 text-sm font-semibold text-slate-500">Eigen bediening</h3>
			<div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each [{ id: 'modes', label: 'Vakantiemodi' }, { id: 'devices', label: 'Eigen apparaten' }] as entry (entry.id)}
					<button type="button" class="flex min-h-36 flex-col items-start justify-center gap-3 rounded-lg border border-slate-300 bg-white p-6 text-left hover:border-sky-500 hover:bg-sky-50" on:click={() => dispatch('own', entry.id === 'modes' ? 'modes' : 'devices')}><span class="text-2xl font-semibold text-slate-900">{entry.label}</span></button>
				{/each}
			</div>
			<h3 class="mb-3 text-sm font-semibold text-slate-500">Shelly ruimtes</h3>
		{/if}
		{#if !snapshot}<p class="py-6 text-slate-600">
				{loading ? 'Ruimtes laden…' : 'Ruimtes niet beschikbaar.'}
			</p>
		{:else if !selectedRoom}
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each snapshot.rooms as entry (entry.id)}
					<button
						type="button"
						class="flex min-h-44 flex-col items-start justify-center gap-3 rounded-lg border border-slate-300 bg-white p-6 text-left hover:border-sky-500 hover:bg-sky-50 disabled:opacity-60"
						disabled={!entry.found}
						on:click={() => chooseRoom(entry.id)}
					>
						<span class="text-2xl font-semibold text-slate-900">{entry.name}</span>
						<span class="text-sm text-slate-600"
							>{entry.found
								? `${entry.count} apparaten ${entry.onlineCount} online`
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
											><Power size={26} aria-hidden="true" /></button
										>
									{:else}
										<div class="flex gap-2" aria-label={`${device.name}: kies Aan of Uit`}>
											<button
												type="button"
												class="shelly-explicit"
												aria-label={`${device.name} ${component.label}: Aan`}
												disabled={pending.has(`${device.id}:${component.id}`) ||
													snapshot.stale ||
													Boolean(error)}
												on:click={() => void command(device, component, 'on')}>Aan</button
											>
											<button
												type="button"
												class="shelly-explicit"
												aria-label={`${device.name} ${component.label}: Uit`}
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
