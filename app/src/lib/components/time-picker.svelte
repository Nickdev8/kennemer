<script lang="ts">
	import { createEventDispatcher, onMount, tick } from 'svelte';

	export let value = '';
	export let label = 'Tijd';
	export let showLabel = false;
	export let disabled = false;
	const dispatch = createEventDispatcher<{ change: { value: string } }>();
	const hours = Array.from({ length: 24 }, (_, hour) => hour);
	const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
	let input: HTMLInputElement;
	let root: HTMLDivElement;
	let open = false;
	let text = value;
	let hour = 0;
	let minute = 0;
	let stage: 'hour' | 'minute' = 'hour';
	let left = 12;
	let top = 12;
	$: if (!open) text = value;
	$: selected = stage === 'hour' ? hour : minute;
	$: angle = (stage === 'hour' ? hour % 12 : minute / 5) * 30;
	$: radius = stage === 'hour' && (hour === 0 || hour > 12) ? 28 : 42;

	function two(number: number) {
		return String(number).padStart(2, '0');
	}
	function valid(time: string) {
		return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
	}
	function position(number: number, inner = false) {
		const radians = (number * Math.PI) / 6;
		const distance = inner ? 28 : 42;
		return `left:${50 + Math.sin(radians) * distance}%;top:${50 - Math.cos(radians) * distance}%`;
	}
	async function show() {
		if (disabled || open) return;
		const initial = valid(value) ? value : '00:00';
		[hour, minute] = initial.split(':').map(Number);
		text = value;
		stage = 'hour';
		const rect = input.getBoundingClientRect();
		left = Math.max(12, Math.min(rect.left, window.innerWidth - 332));
		top =
			rect.bottom + 450 <= window.innerHeight - 12 ? rect.bottom + 8 : Math.max(12, rect.top - 450);
		open = true;
		await tick();
	}
	function commit(time: string) {
		value = time;
		text = time;
		dispatch('change', { value: time });
	}
	function typeTime(event: Event) {
		text = (event.currentTarget as HTMLInputElement).value;
		if (valid(text)) {
			[hour, minute] = text.split(':').map(Number);
			commit(text);
			open = false;
		}
	}
	function chooseHour(next: number) {
		hour = next;
		stage = 'minute';
	}
	function adjustMinute(offset: number) {
		const total = (hour * 60 + minute + offset + 1440) % 1440;
		hour = Math.floor(total / 60);
		minute = total % 60;
	}
	function finish() {
		commit(`${two(hour)}:${two(minute)}`);
		open = false;
	}
	function outside(event: PointerEvent) {
		if (open && event.target instanceof Node && !root.contains(event.target)) open = false;
	}
	onMount(() => {
		window.addEventListener('pointerdown', outside, true);
		return () => window.removeEventListener('pointerdown', outside, true);
	});
</script>

<div bind:this={root} class="time-picker" data-clock-picker>
	<label>
		{#if showLabel}<span class="field-label">{label}</span>{/if}
		<input
			bind:this={input}
			type="text"
			inputmode="text"
			maxlength="5"
			placeholder="HH:MM"
			aria-label={label}
			aria-haspopup="dialog"
			{disabled}
			value={text}
			on:focus={show}
			on:click={show}
			on:input={typeTime}
		/>
	</label>
	{#if open}
		<div
			class="clock-picker"
			style={`left:${left}px;top:${top}px`}
			role="dialog"
			aria-label="Tijdkiezer 24 uur"
			tabindex="-1"
			on:keydown={(event) => {
				if (event.key === 'Escape') open = false;
				event.stopPropagation();
			}}
		>
			<div class="clock-header">
				<button
					type="button"
					class:chosen={stage === 'hour'}
					aria-label="Uren kiezen"
					on:click={() => (stage = 'hour')}>{two(hour)}</button
				>
				<span>:</span>
				<button
					type="button"
					class:chosen={stage === 'minute'}
					aria-label="Minuten kiezen"
					on:click={() => (stage = 'minute')}>{two(minute)}</button
				>
			</div>
			<div
				class="clock-face"
				role="group"
				aria-label={stage === 'hour' ? 'Kies uur (00–23)' : 'Kies minuten'}
			>
				<div class="hand" style={`height:${radius}%;transform:rotate(${angle}deg)`}></div>
				<span class="center"></span>
				{#if stage === 'hour'}
					{#each hours as number}
						<button
							type="button"
							class="clock-number"
							class:selected={selected === number}
							style={position(number % 12, number === 0 || number > 12)}
							aria-label={`Uur ${two(number)}`}
							on:click={() => chooseHour(number)}>{two(number)}</button
						>
					{/each}
				{:else}
					{#each minutes as number}
						<button
							type="button"
							class="clock-number"
							class:selected={selected === number}
							style={position(number / 5)}
							aria-label={`Minuut ${two(number)}`}
							on:click={() => (minute = number)}>{two(number)}</button
						>
					{/each}
				{/if}
			</div>
			<div class="clock-actions">
				{#if stage === 'minute'}
					<button
						type="button"
						aria-label="Een minuut eerder"
						on:click={() => adjustMinute(-1)}>−</button
					>
					<span>{two(minute)} min</span>
					<button
						type="button"
						aria-label="Een minuut later"
						on:click={() => adjustMinute(1)}>+</button
					>
				{/if}
				<button type="button" class="done" aria-label="Tijd bevestigen" on:click={finish}
					>Gereed</button
				>
			</div>
		</div>
	{/if}
</div>

<style>
	.time-picker {
		min-width: 0;
	}
	.field-label {
		display: block;
		margin-bottom: 4px;
		font-size: 0.875rem;
		font-weight: 500;
	}
	input {
		width: 100%;
		min-width: 0;
		min-height: 48px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		padding: 8px 12px;
		background: white;
		color: #0f172a;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
	}
	.clock-picker {
		position: fixed;
		z-index: 80;
		width: 320px;
		max-width: calc(100vw - 24px);
		max-height: calc(100dvh - 24px);
		overflow-y: auto;
		border: 1px solid #94a3b8;
		border-radius: 8px;
		background: white;
		padding: 16px;
		box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
	}
	.clock-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-bottom: 12px;
		font-size: 1.5rem;
		font-variant-numeric: tabular-nums;
	}
	button {
		min-height: 44px;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		background: white;
		color: #334155;
		padding: 8px 12px;
		font-weight: 600;
	}
	button.chosen,
	button.selected {
		border-color: #0284c7;
		background: #0284c7;
		color: white;
	}
	.clock-face {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: #f1f5f9;
	}
	.clock-number {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 38px;
		min-height: 38px;
		border: 0;
		border-radius: 50%;
		padding: 0;
		background: transparent;
		font-size: 0.875rem;
	}
	.hand {
		position: absolute;
		z-index: 0;
		bottom: 50%;
		left: calc(50% - 1px);
		width: 2px;
		background: #0284c7;
		transform-origin: center bottom;
		pointer-events: none;
	}
	.center {
		position: absolute;
		top: calc(50% - 3px);
		left: calc(50% - 3px);
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #0284c7;
	}
	.clock-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
		font-size: 0.875rem;
	}
	.done {
		margin-left: auto;
	}
</style>
