<script lang="ts">
	import { onMount, tick } from 'svelte';

	type Editable = HTMLInputElement | HTMLTextAreaElement;
	type Layout = 'letters' | 'symbols' | 'numeric';

	const textTypes = new Set(['text', 'password', 'search', 'email', 'tel', 'url', 'number']);
	const letterRows = [
		['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
		['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
		['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
		['?123', ',', 'Spatie', '.', 'Gereed']
	];
	const symbolRows = [
		['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
		['-', '/', ':', ';', '(', ')', '€', '&', '@', '"'],
		['ABC', '.', ',', '?', '!', "'", '[', ']', '⌫'],
		['{', '}', '_', '#', '\\', 'Spatie', '=', '+', 'Gereed']
	];
	const numericRows = [
		['1', '2', '3'],
		['4', '5', '6'],
		['7', '8', '9'],
		['ABC', '0', '⌫'],
		['-', '.', 'Gereed']
	];

	let visible = false;
	let active: Editable | null = null;
	let layout: Layout = 'letters';
	let shift = false;
	let touchSeen = false;
	let mobileBrowser = false;
	$: rows = layout === 'numeric' ? numericRows : layout === 'symbols' ? symbolRows : letterRows;

	function editable(target: EventTarget | null): Editable | null {
		if (target instanceof HTMLTextAreaElement) return target.disabled || target.readOnly ? null : target;
		if (target instanceof HTMLInputElement && textTypes.has(target.type)) {
			return target.disabled || target.readOnly ? null : target;
		}
		return null;
	}

	async function show(input: Editable) {
		if (mobileBrowser || !document.contains(input)) return;
		active = input;
		layout = input instanceof HTMLInputElement &&
			(input.type === 'number' || input.inputMode === 'numeric' || input.inputMode === 'decimal' || input.type === 'password')
			? 'numeric' : 'letters';
		shift = false;
		visible = true;
		await tick();
		input.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	function insert(value: string, remove = false) {
		const input = active;
		if (!input || !document.contains(input) || input.disabled || input.readOnly) { visible = false; return; }
		const noSelection = input instanceof HTMLInputElement && (input.type === 'number' || input.type === 'email');
		if (noSelection) {
			input.value = remove ? input.value.slice(0, -1) : input.value + value;
		} else {
			const start = input.selectionStart ?? input.value.length;
			const end = input.selectionEnd ?? start;
			const from = remove && start === end ? Math.max(0, start - 1) : start;
			const replacement = remove ? '' : value;
			if (input.maxLength >= 0 && input.value.length - (end - from) + replacement.length > input.maxLength) return;
			input.setRangeText(replacement, from, end, 'end');
		}
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.focus({ preventScroll: true });
	}

	function press(key: string) {
		if (key === 'Gereed') { visible = false; return; }
		if (key === 'ABC') { layout = 'letters'; return; }
		if (key === '?123') { layout = 'symbols'; return; }
		if (key === '⇧') { shift = !shift; return; }
		if (key === '⌫') { insert('', true); return; }
		insert(key === 'Spatie' ? ' ' : shift ? key.toUpperCase() : key);
		if (shift) shift = false;
	}

	onMount(() => {
		mobileBrowser = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType === 'touch') touchSeen = true;
			const element = event.target instanceof Element ? event.target : null;
			if (element?.closest('[data-touch-keyboard]')) return;
			const input = editable(event.target);
			if (input && (touchSeen || navigator.maxTouchPoints > 0)) void show(input);
			else visible = false;
		};
		const onFocusIn = (event: FocusEvent) => {
			const input = editable(event.target);
			if (input && (touchSeen || navigator.maxTouchPoints > 0)) void show(input);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (visible && event.key === 'Escape') visible = false;
		};
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('focusin', onFocusIn, true);
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('focusin', onFocusIn, true);
			window.removeEventListener('keydown', onKeyDown, true);
		};
	});
</script>

{#if visible}
	<div class="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-400 bg-slate-100 p-2 shadow-lg" data-touch-keyboard role="group" aria-label="Schermtoetsenbord" on:pointerdown|preventDefault>
		<div class="mx-auto max-w-4xl">
			<div class="mb-1 flex items-center justify-between px-1 text-sm text-slate-700">
				<span>Toetsenbord</span>
				<button type="button" class="rounded border border-slate-400 bg-white px-3 py-1" on:click={() => visible = false}>Sluiten</button>
			</div>
			{#each rows as row, rowIndex}
				<div class="mb-1 flex justify-center gap-1">
					{#each row as key, keyIndex (`${rowIndex}-${keyIndex}`)}
						<button type="button" class:wide={key === 'Spatie'} class="key" aria-label={key === '⌫' ? 'Backspace' : key === '⇧' ? 'Shift' : key} on:click={() => press(key)}>{shift && key.length === 1 ? key.toUpperCase() : key}</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.key { min-width: 0; flex: 1 1 0; min-height: 48px; max-width: 80px; border: 1px solid #94a3b8; border-radius: 5px; background: white; color: #0f172a; font-size: 1.2rem; }
	.key.wide { flex: 3 1 0; max-width: 240px; }
	.key:active { background: #cbd5e1; }
</style>
