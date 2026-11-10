<script lang="ts">
	import { onMount } from 'svelte';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import type { VacationStatusView } from '$lib/dashboard/vacation-status';

	type Props = {
		active?: boolean;
		label?: string;
		begin?: () => void | Promise<void>;
		end?: () => void | Promise<void>;
		busy?: boolean;
		error?: string | null;
		beginDisabled?: boolean;
		endDisabled?: boolean;
	};
	let {
		active = false,
		label = 'Vakantiemodus',
		begin = () => {},
		end = () => {},
		busy = false,
		error = null,
		beginDisabled = false,
		endDisabled = false
	}: Props = $props();

	let mounted = $state(false);
	let view = $state<VacationStatusView | null>(null);
	let loading = $state(false);
	let readError = $state('');
	let controller: AbortController | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	const followups = new Set<ReturnType<typeof setTimeout>>();

	$effect(() => {
		if (!mounted) return;
		if (active && !document.hidden) start();
		else stop();
	});

	function stop() {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
		controller?.abort();
		controller = null;
		loading = false;
		for (const timer of followups) clearTimeout(timer);
		followups.clear();
	}

	function start() {
		if (pollTimer || !active || !mounted || document.hidden) return;
		void refresh();
		pollTimer = setInterval(() => void refresh(), 15_000);
	}

	function onVisibilityChange() {
		if (document.hidden) stop();
		else if (active) start();
	}

	async function refresh(force = false) {
		if (!active || !mounted || document.hidden || controller) return;
		const request = new AbortController();
		controller = request;
		loading = true;
		const timeout = setTimeout(() => request.abort(), 12_000);
		try {
			const response = await fetch(`/api/modes/vacation${force ? '?refresh=1' : ''}`, {
				signal: request.signal
			});
			const result = (await response.json()) as VacationStatusView;
			if (controller !== request) return;
			if (!response.ok) throw new Error(result.message || 'Status niet beschikbaar.');
			view = result;
			readError = '';
		} catch (cause) {
			if (controller === request) {
				readError = cause instanceof Error ? cause.message : 'Status niet beschikbaar.';
				view = null;
			}
		} finally {
			clearTimeout(timeout);
			if (controller === request) {
				controller = null;
				loading = false;
			}
		}
	}

	async function runAction(action: () => void | Promise<void>) {
		await action();
		if (!active || !mounted || document.hidden) return;
		for (const delay of [2000, 7000]) {
			const timer = setTimeout(() => {
				followups.delete(timer);
				if (active && mounted && !document.hidden) void refresh(true);
			}, delay);
			followups.add(timer);
		}
	}

	function rowState(row: VacationStatusView['rows'][number]) {
		if (row.actual === true)
			return {
				text: row.kind === 'scene' ? 'Ingeschakeld' : 'Aan',
				classes: 'text-emerald-800 bg-emerald-50'
			};
		if (row.actual === false)
			return {
				text: row.kind === 'scene' ? 'Uitgeschakeld' : 'Uit',
				classes: 'text-rose-800 bg-rose-50'
			};
		return { text: 'Onbekend', classes: 'text-slate-700 bg-slate-100' };
	}

	function delayText(kind: 'begin' | 'end', delays: number[]) {
		const unique = [
			...new Set(delays.filter((seconds) => seconds > 0).map((seconds) => Math.round(seconds / 60)))
		].sort((a, b) => a - b);
		if (!unique.length) return '';
		return `${kind === 'begin' ? 'Begin' : 'Einde'}: ${unique.map((minutes) => `na ${minutes} minuten`).join(', ')}`;
	}

	onMount(() => {
		mounted = true;
		document.addEventListener('visibilitychange', onVisibilityChange);
		if (active && !document.hidden) start();
		return () => {
			mounted = false;
			document.removeEventListener('visibilitychange', onVisibilityChange);
			stop();
		};
	});
</script>

<section
	class="flex min-h-0 flex-col gap-4 rounded-lg border border-slate-300 bg-white p-4"
	aria-label={label}
>
	<header class="flex items-center justify-between gap-3">
		<div>
			<h4 class="text-lg font-semibold text-slate-900">{label}</h4>
			<p class="text-sm text-slate-600" role="status" aria-live="polite">
				{view
					? {
							active: 'Actief',
							inactive: 'Niet actief',
							partial: 'Gedeeltelijk actief',
							unknown: 'Onbekend'
						}[view.state]
					: 'Status onbekend'}
				{#if view?.stale}
					· laatst bekend{/if}
			</p>
			{#if view?.simulation}<p class="text-xs text-slate-500">Voorbeeldstatus</p>{/if}
		</div>
		<button
			type="button"
			class="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 font-semibold text-slate-700 disabled:opacity-50"
			disabled={loading}
			onclick={() => void refresh(true)}
			aria-label="Vakantiestatus vernieuwen"
		>
			<RefreshCw size={17} aria-hidden="true" /> Vernieuwen
		</button>
	</header>

	{#if readError || view?.message}
		<p
			class="border-l-4 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-900"
			role="status"
		>
			{readError || view?.message}
		</p>
	{/if}
	{#if error}<p
			class="border-l-4 border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-900"
			role="alert"
		>
			{error}
		</p>{/if}

	{#if view?.rows.length}
		<ul class="min-h-0 divide-y divide-slate-200 overflow-y-auto" aria-label="Status vakantiemodus">
			{#each view.rows as row (row.id)}
				{@const state = rowState(row)}
				<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
					<div class="min-w-0">
						<p class="font-medium text-slate-900">{row.label}</p>
						<div class="flex flex-wrap gap-x-3 text-xs text-slate-600">
							{#if row.delays.begin.length}<span>{delayText('begin', row.delays.begin)}</span>{/if}
							{#if row.delays.end.length}<span>{delayText('end', row.delays.end)}</span>{/if}
							{#if row.issue}<span>{row.issue}</span>{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<span class={`rounded-md px-2 py-1 text-sm font-semibold ${state.classes}`}
							>{state.text}</span
						>
						<span class="text-xs text-slate-500"
							>{row.source === 'lan'
								? 'LAN'
								: row.source === 'cloud'
									? 'Cloud'
									: 'Bron onbekend'}</span
						>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-slate-600">
			{loading ? 'Status laden…' : 'Geen statusregels beschikbaar.'}
		</p>
	{/if}

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<button
			type="button"
			class="min-h-14 rounded-md border border-slate-300 bg-emerald-700 px-4 py-3 text-lg font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={busy || beginDisabled}
			onclick={() => void runAction(begin)}>Begin vakantie</button
		>
		<button
			type="button"
			class="min-h-14 rounded-md border border-slate-300 bg-rose-700 px-4 py-3 text-lg font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={busy || endDisabled}
			onclick={() => void runAction(end)}>Einde vakantie</button
		>
	</div>
</section>
