<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { resolveControlColor } from './control-colors';
	export let selected = 'regular';
	const dispatch = createEventDispatcher<{ change: { profileId: string } }>();
	const profiles = [
		{ id: 'regular', label: 'Regulier rooster' },
		{ id: 'short', label: 'Verkort rooster' },
		{ id: 'ten-minute', label: '10-minutenbel' }
	];
	const green = resolveControlColor('green')!;
</script>

<section class="mb-6 border-b border-slate-200 pb-5" aria-labelledby="bell-profile-title">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h3 id="bell-profile-title" class="text-base font-semibold text-slate-900">Schoolbel</h3>
		<span class="text-sm text-slate-600">Belduur: 1 seconde</span>
	</div>
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Belrooster">
		{#each profiles as profile (profile.id)}
			<label
				class={`relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border px-4 py-4 text-center ${selected === profile.id ? '' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
				style={selected === profile.id
					? `background:${green.background};border-color:${green.border};color:${green.text}`
					: undefined}
			>
				<input
					class="peer sr-only"
					type="radio"
					name="bell-profile"
					value={profile.id}
					bind:group={selected}
					aria-label={profile.label}
					on:change={() => dispatch('change', { profileId: profile.id })}
				/>
				<span
					class="pointer-events-none absolute inset-0 rounded-lg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600"
				></span>
				<span class="text-lg font-semibold">{profile.label}</span>
				<span class="text-sm">{selected === profile.id ? 'Geselecteerd' : 'Niet geselecteerd'}</span
				>
			</label>
		{/each}
	</div>
</section>
